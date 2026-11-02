import { state, getChatStates } from "../js/state.js";
import { getActivePersona, getActiveChatId, saveChatSummaries, saveChatSummarizedMessageCount, loadPinnedFacts, MOOD_BEHAVIORS, getStageBehavior, getSessionMemory, calculateRelationshipStage, getChatTotalMessageCount } from "./storage.js";
import { retrieveRelevantMemories } from "./ragService.js";
import { formatMemoryToMarkdown, getCodexProcessedCount, CODEX_AUTO_UPDATE_EVERY } from "./sessionMemoryService.js";
import { scanLoreBookAndBuildContent } from "./lorebook.js";
import { checkLoreBookTriggers } from "../js/stemmer.js";

export function replaceMacros(text, character) {
  if (!text) return "";
  
  const activePersona = getActivePersona();
  const userName = activePersona ? (activePersona.userName || "User") : "User";
  const userPronouns = activePersona ? (activePersona.userPronouns || "he/him") : "he/him";
  const charGender = character?.gender || "he/him";
  const charName = character?.name || "Character";
  
  let charHe = "he", charHim = "him", charHis = "his", charHers = "hers", charA = "", charYa = "", charGenderRu = "парень";
  if (charGender === "she/her") {
    charHe = "she"; charHim = "her"; charHis = "her"; charHers = "hers"; charA = "а"; charYa = "я"; charGenderRu = "девушка";
  } else if (charGender === "they/them") {
    charHe = "they"; charHim = "them"; charHis = "their"; charHers = "theirs"; charA = "и"; charYa = "и"; charGenderRu = "персонаж";
  }

  let userHe = "he", userHim = "him", userHis = "his", userHers = "hers", userA = "", userYa = "", userGenderRu = "парень";
  if (userPronouns === "she/her") {
    userHe = "she"; userHim = "her"; userHis = "her"; userHers = "hers"; userA = "а"; userYa = "я"; userGenderRu = "девушка";
  } else if (userPronouns === "they/them") {
    userHe = "they"; userHim = "them"; userHis = "their"; userHers = "theirs"; userA = "и"; userYa = "и"; userGenderRu = "пользователь";
  }

  return text
    .replace(/{{char}}/gi, charName)
    .replace(/{{user}}/gi, userName)
    .replace(/{{he}}/gi, charHe)
    .replace(/{{him}}/gi, charHim)
    .replace(/{{his}}/gi, charHis)
    .replace(/{{hers}}/gi, charHers)
    .replace(/{{user_he}}/gi, userHe)
    .replace(/{{user_him}}/gi, userHim)
    .replace(/{{user_his}}/gi, userHis)
    .replace(/{{user_hers}}/gi, userHers)
    .replace(/{{char_a}}/gi, charA)
    .replace(/{{user_a}}/gi, userA)
    .replace(/{{char_ya}}/gi, charYa)
    .replace(/{{user_ya}}/gi, userYa)
    .replace(/{{char_gender_ru}}/gi, charGenderRu)
    .replace(/{{user_gender_ru}}/gi, userGenderRu);
}

// Builds the structured-memory block with a freshness marker: when the codex
// lags behind the live chat, the model is told which layer holds the current truth.
export function buildSessionCodexBlock(memory, chatLength, isRu, options = {}) {
  const codexMd = formatMemoryToMarkdown(memory, options);
  if (!codexMd || !codexMd.trim()) return "";
  const processedCount = getCodexProcessedCount(memory);
  const staleBy = chatLength - processedCount;
  let note = "";
  if (processedCount > 0 && staleBy > 0) {
    note = isRu
      ? `\n[ПРИМЕЧАНИЕ: Эта память обновлена ${staleBy} сообщ. назад. Если она расходится с саммари или последними сообщениями — ТЕКУЩЕЕ состояние определяют саммари и недавний диалог, а не этот блок.]`
      : `\n[NOTE: This memory was last updated ${staleBy} messages ago. If it conflicts with the story summary or recent messages, the CURRENT state is defined by the summary and recent dialogue, not this block.]`;
  }
  return `<session_memory_codex>\n${codexMd.trim()}${note}\n</session_memory_codex>`;
}

export function buildWorldLoreCompendium(worldLore, activeChatId, userInput = "", sessionMemory = null) {
  if (!worldLore) return { loreBlock: "", includedNames: new Set() };

  const locations = Array.isArray(worldLore.locations) ? worldLore.locations : [];
  const rules = Array.isArray(worldLore.rules) ? worldLore.rules : [];
  const factions = Array.isArray(worldLore.factions) ? worldLore.factions : [];
  const items = Array.isArray(worldLore.items) ? worldLore.items : [];

  const totalCount = locations.length + rules.length + factions.length + items.length;
  if (totalCount === 0) return { loreBlock: "", includedNames: new Set() };

  const includedNames = new Set();
  const recentMsgs = (state.chats?.[activeChatId] || []).slice(-2);
  const triggerContext = (recentMsgs.map(m => m.content || "").join(" ") + " " + (userInput || "")).trim();
  const currentLocation = (sessionMemory?.setting?.location || "").trim().toLowerCase();

  const shouldInclude = (item) => {
    if (!item) return false;
    const name = typeof item === "string" ? item : (item.name || "");
    if (!name) return false;
    if (totalCount <= 6) {
      includedNames.add(name);
      return true;
    }
    // For > 6, check triggers or match current location
    const keys = (typeof item === "object" && item.triggers) ? item.triggers : name;
    const matchesTrigger = checkLoreBookTriggers(triggerContext, keys);
    const matchesLocation = Boolean(
      currentLocation &&
      (currentLocation.includes(name.toLowerCase()) || name.toLowerCase().includes(currentLocation))
    );
    if (matchesTrigger || matchesLocation) {
      includedNames.add(name);
      return true;
    }
    return false;
  };

  const loreLines = [];
  const addCat = (catName, catItems) => {
    const activeItems = catItems.filter(shouldInclude);
    if (activeItems.length > 0) {
      loreLines.push(`=== ${catName} ===`);
      activeItems.forEach(it => {
        const name = typeof it === "string" ? it : it.name;
        const desc = typeof it === "string" ? "" : it.description;
        if (name && desc) {
          loreLines.push(`• ${name}: ${desc}`);
        } else if (name) {
          loreLines.push(`• ${name}`);
        } else if (desc) {
          loreLines.push(`• ${desc}`);
        }
      });
    }
  };

  addCat("Локации и Страны", locations);
  addCat("Магия и Правила Мира", rules);
  addCat("Фракции и Гильдии", factions);
  addCat("Реликвии и Артефакты", items);

  const loreBlock = loreLines.length > 0 ? `<world_lore_compendium>\n${loreLines.join("\n")}\n</world_lore_compendium>` : "";
  return { loreBlock, includedNames };
}

export function buildMemoryAndSummaryBlocks(activeChatId, chatLength, isRu, options = {}) {
  const parts = [];
  const sessionMemory = getSessionMemory(activeChatId);
  let codexBlock = "";
  let isCodexFresh = false;
  let codexProcessed = 0;

  if (sessionMemory) {
    codexBlock = buildSessionCodexBlock(sessionMemory, chatLength, isRu, options);
    codexProcessed = getCodexProcessedCount(sessionMemory);
    const staleBy = chatLength - codexProcessed;
    if (codexBlock && staleBy <= CODEX_AUTO_UPDATE_EVERY) {
      isCodexFresh = true;
    }
  }

  const summary = state.chatSummaries?.[activeChatId];
  const summaryCount = state.chatSummarizedMessageCount?.[activeChatId] || 0;

  if (isCodexFresh) {
    if (codexBlock) parts.push(codexBlock);
    if (summary && summary.trim() && summaryCount > codexProcessed) {
      const sitMatch = summary.match(/(?:📍\s*ТЕКУЩАЯ\s*СИТУАЦИЯ|📍\s*CURRENT\s*SITUATION)[:\s]*\n([\s\S]*?)(?=\n(?:📖|👥|📍|$))/i)
        || summary.match(/(?:Активная\s*цель(?:\s*\/\s*угроза)?|Active\s*Objective(?:\s*\/\s*Threat)?)\s*[:—\-]\s*([^\n]+)/i);
      const deltaText = sitMatch ? (sitMatch[1] || sitMatch[0]).trim() : "";
      if (deltaText) {
        parts.push(`<recent_story_delta>\n${deltaText}\n</recent_story_delta>`);
      }
    }
  } else {
    if (summary && summary.trim()) {
      parts.push(`<story_summary>\n${summary.trim()}\n</story_summary>`);
    }
    if (codexBlock) {
      parts.push(codexBlock);
    }
  }
  return parts;
}

export function formatRetrievedMemories(ragMemories, includedLoreNames) {
  if (!ragMemories || !Array.isArray(ragMemories) || ragMemories.length === 0) return "";
  let filtered = ragMemories;
  if (includedLoreNames && includedLoreNames.size > 0) {
    filtered = filtered.filter(m => {
      if (m.messageIndex === "Лор Мира" || (m.text && m.text.includes("[Энциклопедия Мира — "))) {
        for (const name of includedLoreNames) {
          if (name && m.text.toLowerCase().includes(name.toLowerCase())) {
            return false;
          }
        }
      }
      return true;
    });
  }
  if (filtered.length === 0) return "";
  const formattedRag = filtered.map(m => {
    const relTag = typeof m.jevRelevance === "number" ? ` (Релевантность: ${Math.round(m.jevRelevance * 100)}%)` : "";
    let txt = (m.text || "").trim();
    if (txt.length > 320) {
      txt = txt.slice(0, 317) + "...";
    }
    return `- [Ход #${m.messageIndex}${relTag}]: ${txt}`;
  }).join("\n");
  return `<retrieved_memories>\n${formattedRag}\n</retrieved_memories>`;
}

/**
 * Resolves the textual description of the active coreState stage (0-100)
 * from the character's 6 defined stages:
 * Index 0: <= 20
 * Index 1: <= 40
 * Index 2: <= 60
 * Index 3: <= 80
 * Index 4: <= 95
 * Index 5: > 95
 */
export function getCoreStateStageDescription(cs, value) {
  if (!cs || !Array.isArray(cs.stages) || cs.stages.length === 0) return "";
  const num = typeof value === "number" ? value : (typeof cs.defaultValue === "number" ? cs.defaultValue : 20);
  let idx = 0;
  if (num <= 20) idx = 0;
  else if (num <= 40) idx = 1;
  else if (num <= 60) idx = 2;
  else if (num <= 80) idx = 3;
  else if (num <= 95) idx = 4;
  else idx = 5;

  const clampedIdx = Math.min(cs.stages.length - 1, Math.max(0, idx));
  return cs.stages[clampedIdx] || "";
}

/**
 * Checks whether the <personality> block should be emitted, preventing
 * token-wasting duplicates when personality is a composite glue of appearance/behavior/etc.
 * or merely repeats behavior.
 */
export function shouldIncludePersonality(character, personality, behavior, appearance, backstory, speech) {
  if (!personality || !personality.trim()) return false;
  const pTrim = personality.trim();
  const bTrim = (behavior || "").trim();
  
  if (bTrim && pTrim.toLowerCase() === bTrim.toLowerCase()) {
    return false;
  }

  const hasSpecificFields = Boolean(appearance?.trim() || behavior?.trim() || backstory?.trim() || speech?.trim());
  const hasGluedMarkers = /\[(Внешность|Характер и поведение|Предыстория|Стиль общения|Appearance|Behavior|Backstory|Speech)\]/i.test(pTrim);
  if (hasSpecificFields && hasGluedMarkers) {
    return false;
  }

  return true;
}

/**
 * Convenience helper returning clean deduplicated personality text or empty string.
 */
export function getDeduplicatedPersonality(character) {
  if (!character) return "";
  const personality = character.personality || "";
  if (!shouldIncludePersonality(character, personality, character.behavior, character.appearance, character.backstory, character.speech)) {
    return "";
  }
  return personality.trim();
}

/**
 * Extracts a compact voice sample from exampleDialogs (up to maxChars)
 * to keep the character's voice stable in cache throughout the entire chat.
 */
export function extractVoiceSample(examples, maxChars = 450) {
  if (!examples || typeof examples !== "string") return "";
  const trimmed = examples.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const slice = trimmed.slice(0, maxChars);
  const lastDoubleNewline = slice.lastIndexOf("\n\n");
  if (lastDoubleNewline > 150) {
    return slice.slice(0, lastDoubleNewline).trim();
  }
  const lastNewline = slice.lastIndexOf("\n");
  if (lastNewline > 150) {
    return slice.slice(0, lastNewline).trim();
  }
  const lastPunct = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"), slice.lastIndexOf('"'), slice.lastIndexOf("»"));
  if (lastPunct > 150) {
    return slice.slice(0, lastPunct + 1).trim();
  }
  return slice.trim();
}

export function buildSystemContext(character, userInput = "", duoPartner = null, duoStates = null, sharedScenario = null, chatId = null, customRagMemories = null) {
  const activeChatId = chatId || getActiveChatId(character?.id);
  const chat = state.chats?.[activeChatId] || [];
  const parts = [];
  
  const desc = replaceMacros(character.description || "", character);
  const personality = replaceMacros(character.personality || "", character);
  const speech = replaceMacros(character.speech || "", character);
  const behavior = replaceMacros(character.behavior || "", character);
  const backstory = replaceMacros(character.backstory || "", character);
  const appearance = replaceMacros(character.appearance || "", character);
  const customScenario = (state.chatMetadata?.[activeChatId]?.customScenario || "").trim();
  const isCustomScenarioActive = Boolean(customScenario && typeof sharedScenario !== "string");
  const scenario = (typeof sharedScenario === "string")
    ? sharedScenario
    : replaceMacros(customScenario || character.scenario || "", character);
  const systemPrompt = replaceMacros(character.systemPrompt || "", character);
  const globalPrompt = replaceMacros(state.globalSystemPrompt || "", character);
  const charGender = character.gender || "he/him";
  
  const genderMap = {
    "he/him": {
      label: "Male (he/him)",
      ruHint: "ОБЯЗАТЕЛЬНО используй мужской род при отыгрыше за себя (окончания: делал, пришел, был).",
      enHint: "ALWAYS use masculine pronouns and grammatical forms when acting as yourself."
    },
    "she/her": {
      label: "Female (she/her)",
      ruHint: "ОБЯЗАТЕЛЬНО используй женский род при отыгрыше за себя (окончания: делала, пришла, была).",
      enHint: "ALWAYS use feminine pronouns and grammatical forms when acting as yourself."
    },
    "they/them": {
      label: "Non-binary (they/them)",
      ruHint: "ОБЯЗАТЕЛЬНО используй нейтральный или множественный род при отыгрыше за себя.",
      enHint: "ALWAYS use gender-neutral pronouns and forms when acting as yourself."
    }
  };
  const genderInfo = genderMap[charGender] || genderMap["he/him"];
  const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";

  if (globalPrompt.trim()) {
    if (isRu) {
      parts.push(`<global_system_prompt priority="supreme">\n🚨 ВЫСШИЙ СИСТЕМНЫЙ ПРИОРИТЕТ — ГЛОБАЛЬНЫЕ ПРАВИЛА ИЗ НАСТРОЕК:\n${globalPrompt.trim()}\n</global_system_prompt>`);
    } else {
      parts.push(`<global_system_prompt priority="supreme">\n🚨 SUPREME SYSTEM PRIORITY — GLOBAL SETTINGS RULES:\n${globalPrompt.trim()}\n</global_system_prompt>`);
    }
  }

  if (isRu) {
    parts.push(`<character_info>
Role: ${character.name}
Gender/Pronouns: ${genderInfo.label}
Grammar Rule: ${genderInfo.ruHint}
</character_info>`);
  } else {
    parts.push(`<character_info>
Role: ${character.name}
Gender/Pronouns: ${genderInfo.label}
Grammar Rule: ${genderInfo.enHint}
</character_info>`);
  }

  if (desc.trim()) {
    if (isCustomScenarioActive) {
      if (isRu) {
        parts.push(`<character_description>\n${desc.trim()}\n[ПРИМЕЧАНИЕ: Данное описание служит только для понимания внешности, способностей и черт персонажа. Любые упоминания оригинального места действия, исходного задания или обстоятельств встречи полностью аннулированы активным кастомным сценарием ниже.]\n</character_description>`);
      } else {
        parts.push(`<character_description>\n${desc.trim()}\n[NOTE: Use this description strictly for character appearance, capabilities, and traits. Any references to default location, original mission, or meeting premise are superseded by the active custom scenario below.]\n</character_description>`);
      }
    } else {
      parts.push(`<character_description>\n${desc.trim()}\n</character_description>`);
    }
  }
  const dedupedPersonality = getDeduplicatedPersonality({
    ...character,
    personality,
    behavior,
    appearance,
    backstory,
    speech
  });
  if (dedupedPersonality) {
    parts.push(`<personality>\n${dedupedPersonality}\n</personality>`);
  }
  if (speech.trim()) parts.push(`<speech_style>\n${speech.trim()}\n</speech_style>`);
  if (behavior.trim()) parts.push(`<behavior_and_habits>\n${behavior.trim()}\n</behavior_and_habits>`);
  if (appearance.trim()) parts.push(`<appearance>\n${appearance.trim()}\n</appearance>`);
  if (backstory.trim()) {
    if (isCustomScenarioActive) {
      if (isRu) {
        parts.push(`<backstory>\n${backstory.trim()}\n[ПРИМЕЧАНИЕ: Предыстория отражает прошлый жизненный опыт персонажа. Исходная стартовая сцена заменена новым кастомным сценарием.]\n</backstory>`);
      } else {
        parts.push(`<backstory>\n${backstory.trim()}\n[NOTE: Backstory reflects past background. The starting roleplay scene is replaced by the custom scenario.]\n</backstory>`);
      }
    } else {
      parts.push(`<backstory>\n${backstory.trim()}\n</backstory>`);
    }
  }
  if (scenario.trim()) {
    if (isCustomScenarioActive) {
      if (isRu) {
        parts.push(`<roleplay_scenario active_override="true">
🚨 АКТИВНЫЙ КАСТОМНЫЙ СЦЕНАРИЙ (ВЫСШИЙ ПРИОРИТЕТ СЮЖЕТА):
${scenario.trim()}
- ПОЛНАЯ ЗАМЕНА СЦЕНАРИЯ: Полностью аннулирует дефолтный сеттинг, стартовую локацию и квесты.
- СОХРАНЕНИЕ ХАРАКТЕРА НА 100%: Строго сохраняй аутентичный характер, голос и психологию ${character.name}.
- Игнорируй любые старые описания исходной локации персонажа в пользу этого сценария.
</roleplay_scenario>`);
      } else {
        parts.push(`<roleplay_scenario active_override="true">
🚨 ACTIVE CUSTOM SCENARIO (HIGHEST PRIORITY):
${scenario.trim()}
- COMPLETE SCENARIO OVERRIDE: Supersedes default setting, initial location, and quests.
- 100% PERSONALITY PRESERVATION: Strictly preserve authentic voice, psychology, and mannerisms of ${character.name}.
- Disregard conflicting old setting or premises in favor of this active scenario.
</roleplay_scenario>`);
      }
    } else {
      parts.push(`<roleplay_scenario>\n${scenario.trim()}\n</roleplay_scenario>`);
    }
  }

  const userSelectedGenre = state.chatMetadata?.[activeChatId]?.worldGenre || character?.worldGenre || character?.genreKey || state.apiSettings?.worldGenre || "";
  const contextText = `${scenario} ${desc} ${personality} ${character.systemPrompt || ""} ${state.globalSystemPrompt || ""}`;
  const isFantasyWorld = userSelectedGenre === "fantasy" || (!isCustomScenarioActive && !userSelectedGenre && /фэнтези|fantasy|маги|magic|дракон|dragon|меч|sword|маг|wizard|рыцарь|knight|средневеков|паладин|гоблин|эльф|гном|заклинани/i.test(contextText));

  if (isFantasyWorld) {
    if (isRu) {
      parts.push(`<setting_rule>\nСеттинг: ФЭНТЕЗИ (Средневековье / Магия). Используй только фэнтезийные термины, избегай современных анахронизмов.\n</setting_rule>`);
    } else {
      parts.push(`<setting_rule>\nSetting: FANTASY WORLD (Medieval / Magic). Use only authentic fantasy terms, avoid modern anachronisms.\n</setting_rule>`);
    }
  } else if (userSelectedGenre === "scifi" || userSelectedGenre === "cyberpunk") {
    if (isRu) {
      parts.push(`<setting_rule>\nСеттинг: НАУЧНАЯ ФАНТАСТИКА / КИБЕРПАНК. Футуристические технологии и терминология.\n</setting_rule>`);
    } else {
      parts.push(`<setting_rule>\nSetting: SCI-FI / CYBERPUNK. Futuristic technology and concepts.\n</setting_rule>`);
    }
  }

  if (systemPrompt.trim()) {
    if (globalPrompt.trim()) {
      if (isRu) {
        parts.push(`<character_system_prompt>
[Индивидуальные инструкции карточки персонажа. В случае любого противоречия с глобальными правилами из настроек (<global_system_prompt>) безусловный приоритет всегда имеют глобальные правила.]
${systemPrompt.trim()}
</character_system_prompt>`);
      } else {
        parts.push(`<character_system_prompt>
[Individual character card instructions. In case of any conflict with global settings rules (<global_system_prompt>), global rules always have absolute priority.]
${systemPrompt.trim()}
</character_system_prompt>`);
      }
    } else {
      parts.push(`<character_system_prompt>\n${systemPrompt.trim()}\n</character_system_prompt>`);
    }
  }

  if (character.traits && character.traits.length > 0) {
    const traitsList = character.traits.map(t => replaceMacros(t, character));
    parts.push(`<personality_traits>\nYour traits: ${traitsList.join(", ")}. Stay in character and let these traits show naturally.\n</personality_traits>`);
  }

  const hiddenTraitsEnabled = state.apiSettings?.enableHiddenTraits !== false;
  if (hiddenTraitsEnabled && character.hiddenTraits && character.hiddenTraits.length > 0) {
    const hiddenList = character.hiddenTraits.map(t => replaceMacros(t, character));
    parts.push(`<hidden_traits>\nSecret traits: ${hiddenList.join(", ")}.\nNever explicitly mention or announce; reveal subtle emotional subtext only as trust develops.\n</hidden_traits>`);
  }

  const activePersona = getActivePersona();
  if (activePersona) {
    const userContextLines = [];
    userContextLines.push(`Name: ${activePersona.userName}`);
    userContextLines.push(`Pronouns: ${activePersona.userPronouns}`);
    if (activePersona.description && activePersona.description.trim()) {
      userContextLines.push(`Description/Backstory: ${activePersona.description.trim()}`);
    }
    parts.push(`<user_info>\n${userContextLines.join("\n")}\n</user_info>`);
  }

  const allPinned = loadPinnedFacts();
  const pinnedList = allPinned[activeChatId] || [];
  if (pinnedList.length > 0) {
    const formatted = pinnedList.map(f => `- ${f}`).join("\n");
    parts.push(`<pinned_memory_facts>\n${formatted}\n</pinned_memory_facts>`);
  }

  // --- Dynamic Tail (Recency & State Changes) ---
  const directivesMap = state.characterDirectives || {};
  const activeDirectives = (directivesMap[activeChatId] || []).filter(d => d.active !== false && d.text && d.text.trim());
  if (activeDirectives.length > 0) {
    const hardDirectives = activeDirectives.filter(d => d.priority === "hard");
    const normalDirectives = activeDirectives.filter(d => d.priority !== "hard");

    if (hardDirectives.length > 0) {
      const hardList = hardDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRu) {
        parts.push(`<hard_priority_directives>\n🚨 КРИТИЧЕСКИЙ ПРИОРИТЕТ — ОБЯЗАТЕЛЬНЫЕ УСТАНОВКИ:\n${hardList}\n</hard_priority_directives>`);
      } else {
        parts.push(`<hard_priority_directives>\n🚨 CRITICAL HARD PRIORITY DIRECTIVES:\n${hardList}\n</hard_priority_directives>`);
      }
    }

    if (normalDirectives.length > 0) {
      const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRu) {
        parts.push(`<core_directives>\n${normalList}\n</core_directives>`);
      } else {
        parts.push(`<core_directives>\n${normalList}\n</core_directives>`);
      }
    }
  }

  const charLore = scanLoreBookAndBuildContent(character, userInput, activeChatId);
  if (charLore && charLore.trim()) {
    parts.push(`<character_lorebook>\n${replaceMacros(charLore.trim(), character)}\n</character_lorebook>`);
  }

  const chatMeta = state.chatMetadata?.[activeChatId] || {};
  const worldLore = chatMeta.worldLore;
  const sessionMemory = getSessionMemory(activeChatId);
  const { loreBlock, includedNames } = buildWorldLoreCompendium(worldLore, activeChatId, userInput, sessionMemory);
  if (loreBlock) {
    parts.push(loreBlock);
  }

  // Clear summary only if the chat has been completely cleared/emptied
  if (chat.length === 0) {
    if (state.chatSummaries?.[activeChatId]) {
      delete state.chatSummaries[activeChatId];
      saveChatSummaries(state.chatSummaries);
    }
    if (state.chatSummarizedMessageCount?.[activeChatId]) {
      delete state.chatSummarizedMessageCount[activeChatId];
      saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
    }
  }

  const memSummaryBlocks = buildMemoryAndSummaryBlocks(activeChatId, getChatTotalMessageCount(chat), isRu, {
    activeCharacterName: character?.name,
    isDuo: Boolean(duoPartner),
  });
  if (memSummaryBlocks.length > 0) {
    parts.push(...memSummaryBlocks);
  }

  const recentChat = state.chats?.[activeChatId] || [];
  const enrichedQuery = `${recentChat.slice(-4).map(m => m.content).join(" ")} ${userInput}`;
  const ragMemories = Array.isArray(customRagMemories)
    ? customRagMemories
    : retrieveRelevantMemories(activeChatId, enrichedQuery, 5);
  const formattedRag = formatRetrievedMemories(ragMemories, includedNames);
  if (formattedRag) {
    parts.push(formattedRag);
  }

  if (character.exampleDialogs?.trim()) {
    const examples = replaceMacros(character.exampleDialogs.trim(), character);
    if (chat.length < 8) {
      parts.push(`<example_dialogues>\n${examples}\n</example_dialogues>`);
    } else {
      const voiceSample = extractVoiceSample(examples, 450);
      if (voiceSample) {
        parts.push(`<example_dialogues voice_sample="compact">\n${voiceSample}\n</example_dialogues>`);
      }
    }
  }

  return parts.join("\n\n");
}


/**
 * Strips <thought>...</thought> (and unclosed <thought>...) blocks from assistant
 * messages before sending history to the API. This prevents reasoning tokens from
 * re-entering the context and causing runaway thought accumulation.
 */
export function stripThoughtTags(text) {
  if (!text) return "";
  // Remove complete XML-style thought blocks (<think>, <thought>, <thinking>, <reasoning>, <reflection>, <reflections>, <details>)
  let result = text.replace(/<(think|thought|thinking|reasoning|reflection|reflections|details)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  // Remove complete bracket-style thought blocks ([THINK], [THOUGHT], [THINKING], [REASONING], [REFLECTION], [REFLECTIONS])
  result = result.replace(/\[(think|thought|thinking|reasoning|reflection|reflections)\][\s\S]*?\[\/\1\]/gi, "");
  // Remove any unclosed thought blocks (streaming artifacts)
  result = result.replace(/<(think|thought|thinking|reasoning|reflection|reflections|details)\b[^>]*>[\s\S]*/gi, "");
  result = result.replace(/\[(think|thought|thinking|reasoning|reflection|reflections)\][\s\S]*/gi, "");
  // Remove plain text thought headers if present at start
  result = result.replace(/^(?:\*\*|\*|#{1,6}\s*)?(?:Thinking Process|Thought Process|Thought|Thinking|Reasoning|Reflection|Reflections|Размышления|Ход мыслей|Мысли)(?:\*\*|\*|:|\s*[:—-])[\s\S]*?(?=\n\n|\n[А-Яа-яA-Za-z*"]|$)/i, "");
  // Remove leading orphan dots like ".Ладно" or ". — "
  result = result.replace(/^\s*\.\s*(?=[А-Яа-яA-Za-z—–\-])/, "");
  return result.trim();
}

export function ensureCleanTextEnding(text) {
  if (!text) return "";
  let clean = text.trim();
  if (!clean) return "";

  const doubleQuotes = (clean.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) {
    clean += '"';
  }

  const asterisks = (clean.match(/\*/g) || []).length;
  if (asterisks % 2 !== 0) {
    clean += '*';
  }

  const lastChar = clean.slice(-1);
  if (!/[.!?…"*\])]/.test(lastChar)) {
    clean += '.';
  }

  return clean;
}

export function sanitizeAssistantHistoryForPrompt(text) {
  if (!text) return "";
  let clean = stripThoughtTags(text);

  // 1. Convert dialogue-opening dashes at the beginning of lines/paragraphs to quotes.
  // Example: "— Привет, — сказала она." -> '"Привет," — сказала она.'
  // Crucially: never touch dashes inside actions *...* or already quoted strings.
  clean = clean.split("\n").map(line => {
    const trimmedLine = line.trimStart();
    if (/^[—–-][ \t]+(?=[А-ЯЁA-Z"«“])/.test(trimmedLine)) {
      const indent = line.slice(0, line.length - trimmedLine.length);
      const withoutDash = trimmedLine.replace(/^[—–-][ \t]+/, "");
      
      const authorMatch = withoutDash.match(/^([^—\n\r*]*?)([,!?…\.])\s*[—–-]\s*(.*)$/);
      if (authorMatch) {
        const speech = authorMatch[1].trim();
        const punct = authorMatch[2];
        const author = authorMatch[3].trim();
        return `${indent}"${speech}${punct}" — ${author}`;
      } else {
        const trimmedSpeech = withoutDash.trim();
        if (!trimmedSpeech.startsWith('"') && !trimmedSpeech.startsWith('«')) {
          return `${indent}"${trimmedSpeech}"`;
        }
      }
    }
    return line;
  }).join("\n");

  // 2. Normalize 2-dot typos: "слово.. слово" -> "слово, слово"
  clean = clean.replace(/([А-Яа-яA-Za-z0-9])\s*\.{2}\s*([А-Яа-яA-Za-z0-9])/g, "$1, $2");

  // 3. Compress excessive 4+ dot chains to standard 3-dot ellipsis: "....." -> "..."
  clean = clean.replace(/\.{4,}/g, "...");

  // 4. Reduce ellipsis spam if a single paragraph contains more than 4 ellipses
  clean = clean.split("\n").map(paragraph => {
    const ellipsisMatches = paragraph.match(/\.{3}/g);
    if (ellipsisMatches && ellipsisMatches.length > 4) {
      let count = 0;
      return paragraph.replace(/\.{3}/g, (m) => {
        count++;
        if (count > 2 && count < ellipsisMatches.length) {
          return ",";
        }
        return m;
      });
    }
    return paragraph;
  }).join("\n");

  return ensureCleanTextEnding(clean);
}

/**
 * Splits text into sentence units ending with [.!?] or newline.
 */
function splitIntoSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Extracts action blocks (*...*) and sentence units from descriptive text.
 */
function extractDescriptiveUnits(text) {
  if (!text || !text.trim()) return [];
  const units = [];
  const actionRegex = /\*[^*]+?\*/g;
  let lastIdx = 0;
  let actionMatch;
  while ((actionMatch = actionRegex.exec(text)) !== null) {
    const beforeAction = text.slice(lastIdx, actionMatch.index).trim();
    if (beforeAction) {
      units.push(...splitIntoSentences(beforeAction));
    }
    units.push(actionMatch[0].trim());
    lastIdx = actionMatch.index + actionMatch[0].length;
  }
  const afterAction = text.slice(lastIdx).trim();
  if (afterAction) {
    units.push(...splitIntoSentences(afterAction));
  }
  return units.filter(u => Boolean(u));
}

/**
 * Compresses older assistant history messages while preserving:
 * 1. 100% of spoken dialogue in quotes ("...", «...», “...”).
 * 2. Opening and closing descriptive action/narrative, replacing the middle with [...].
 * 3. Enforcing maxChars ceiling with smart trimming if dialogues themselves are long.
 */
export function compressOlderHistoryMessage(text, maxChars = 420) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const DIALOGUE_REGEX = /(?:\"[^\"]+?\"|«[^»]+?»|“[^”]+?”)/g;
  const dialogues = [];
  let dMatch;
  while ((dMatch = DIALOGUE_REGEX.exec(trimmed)) !== null) {
    dialogues.push({
      start: dMatch.index,
      end: dMatch.index + dMatch[0].length,
      text: dMatch[0],
    });
  }

  // If there are no dialogues at all in quotes
  if (dialogues.length === 0) {
    const units = extractDescriptiveUnits(trimmed);
    if (units.length <= 2) {
      return trimmed.length <= maxChars
        ? trimmed
        : `${trimmed.slice(0, Math.floor(maxChars * 0.45))}\n[...]\n${trimmed.slice(-Math.floor(maxChars * 0.45))}`;
    }
    const compressed = `${units[0]}\n[...]\n${units[units.length - 1]}`;
    if (compressed.length <= maxChars) return compressed;
    return `${units[0].slice(0, Math.floor(maxChars * 0.45))}\n[...]\n${units[units.length - 1].slice(-Math.floor(maxChars * 0.45))}`;
  }

  // We have 1 or more dialogues
  const beforeFirst = trimmed.slice(0, dialogues[0].start).trim();
  const beforeUnits = extractDescriptiveUnits(beforeFirst);
  const firstUnit = beforeUnits.length > 0 ? beforeUnits[0] : null;

  const afterLast = trimmed.slice(dialogues[dialogues.length - 1].end).trim();
  const afterUnits = extractDescriptiveUnits(afterLast);
  const lastUnit = afterUnits.length > 0 ? afterUnits[afterUnits.length - 1] : null;

  const parts = [];
  if (firstUnit) {
    parts.push(firstUnit);
  }

  for (let i = 0; i < dialogues.length; i++) {
    if (i > 0) {
      const inBetween = trimmed.slice(dialogues[i - 1].end, dialogues[i].start).trim();
      if (inBetween.length > 0) {
        parts.push("[...]");
      }
    } else if (firstUnit && beforeUnits.length > 1) {
      parts.push("[...]");
    }
    parts.push(dialogues[i].text);
  }

  if (lastUnit) {
    if (afterUnits.length > 1) {
      parts.push("[...]");
    }
    parts.push(lastUnit);
  }

  let combined = parts.join("\n").replace(/(\s*\[\.\.\.\]\s*)+/g, "\n[...]\n").trim();

  if (combined.length > maxChars) {
    const half = Math.floor((maxChars - 10) / 2);
    combined = `${combined.slice(0, half)}\n[...]\n${combined.slice(-half)}`;
  }

  return combined;
}

// Detects the self-reinforcing "И..., и..., и..." / "And..., and..." style loop
// in the character's own recent replies.
export function detectAndChainLoop(historyMessages = []) {
  const recentAssistant = historyMessages
    .filter((m) => m && m.role === "assistant" && typeof m.content === "string" && m.content.trim())
    .slice(-4);
  if (recentAssistant.length < 2) return false;

  let flaggedCount = 0;
  for (const msg of recentAssistant) {
    const text = msg.content;
    // Sentences opening with the conjunction "И"/"And" (markdown asterisks/quotes allowed before them)
    const sentenceStarts = (text.match(/(?:^|[.!?…\n\r"«*»]+)\s*(?:И|и|And|and)\s/g) || []).length;
    // Clauses chained together with ", и" / ", and"
    const conjunctionChains = (text.match(/,\s*(?:и|and)\s/gi) || []).length;
    if (sentenceStarts >= 2 || conjunctionChains >= 4 || (sentenceStarts >= 1 && conjunctionChains >= 3)) {
      flaggedCount++;
    }
  }
  return flaggedCount >= 2;
}

// Detects when the assistant ends 3 consecutive replies with questions,
// preventing the conversation from devolving into an interrogation.
export function detectQuestionEndingLoop(historyMessages = []) {
  const recentAssistant = historyMessages
    .filter((m) => m && m.role === "assistant" && typeof m.content === "string" && m.content.trim())
    .slice(-3);
  if (recentAssistant.length < 3) return false;

  return recentAssistant.every((msg) => {
    const clean = stripThoughtTags(msg.content).trim();
    return /\?[ \t\r\n*"»”')\]]*$/.test(clean);
  });
}

// Unified response-length directive, shared by Solo and GM branches.
// Keeps both modes on the same scale and fully localized (ru/en).
export function getResponseLengthDirective(responseLength = "medium", isRu = true) {
  switch (responseLength) {
    case "short":
      return isRu
        ? "Длина ответа: КРАТКИЙ — строго 1-3 предложения в сумме. Никакой воды и лишних абзацев."
        : "Response length: SHORT — strictly 1-3 sentences in total. No filler, no extra paragraphs.";
    case "long":
      return isRu
        ? "Длина ответа: ПОДРОБНЫЙ — 4-5 абзацев. Раскрой действия, детали и реплики полноценно."
        : "Response length: LONG — 4-5 paragraphs. Fully develop actions, details, and dialogue.";
    case "huge":
      return isRu
        ? "Длина ответа: МАКСИМАЛЬНО ПОДРОБНЫЙ — 6+ абзацев. Пиши развёрнуто, глубоко и обстоятельно."
        : "Response length: MAXIMUM DETAIL — 6+ paragraphs. Write expansively and thoroughly.";
    case "adaptive":
      return isRu
        ? "Длина ответа: АДАПТИВНАЯ — сам подбирай объём под ритм сцены: короткая реплика в быстром диалоге, развёрнутая — в ключевые моменты. Не растягивай текст искусственно и не обрезай важное."
        : "Response length: ADAPTIVE — match the scene's rhythm yourself: brief replies in fast-paced dialogue, fuller ones at key moments. Never pad artificially or cut off what matters.";
    case "medium":
    default:
      return isRu
        ? "Длина ответа: СРЕДНИЙ — 2-3 коротких абзаца."
        : "Response length: MEDIUM — 2-3 short paragraphs.";
  }
}

export function getStabsEdhPrompt(isRu = true, userName = "User", isGm = false) {
  if (isRu) {
    if (isGm) {
      return `[STAB'S EDH — ИЕРАРХИЧЕСКИЕ ДИРЕКТИВЫ ВЕДУЩЕГО (GM)]:
• Tier 0 (Суверенитет Пользователя и Проактивный ход):
  - КАТЕГОРИЧЕСКИЙ ЗАПРЕТ КУКЛОВОДСТВА: Никогда не пиши слова, мысли или решения за ${userName}. Управляй ТОЛЬКО NPC и Рассказчиком.
  - ACTION, DRIVE & PASS: 1. Опиши последствия действий Пользователя и реакцию мира/NPC. 2. ОБЯЗАТЕЛЬНО двигай сцену вперед: развивай поведение NPC, вноси события, создавай выбор и напряжение. 3. ПЕРЕДАЧА ХОДА: Чередуй способы (не заканчивай всё вопросом!), останавливайся перед выбором игрока.
  - АНТИ-ЭХО: Не пересказывай реплики игрока.
• Tier 1 (NPC): NPC действуют строго из своих мотивов, слабостей и границ.
• Tier 2 (Anti-Slop): Исключи штампы ("дрожь пробежала", "волна накрыла", "воздух звенел", "время словно замерло", "глаза потемнели", "не смог сдержать"). Описывай осязаемые детали, дистанцию и тон.
• Tier 3 (Anti-Loop & Динамическая прогрессия сцены):
  - КАТЕГОРИЧЕСКИЙ ЗАПРЕТ САМОПОВТОРА (ANTI-LOOP): Запрещено повторять фразы, эмоциональные циклы и микро-жесты из прошлых сообщений. Каждое сообщение ОБЯЗАНО менять позу и делать шаг вперёд.
  - ЗАПРЕТ ЦЕПОЧЕК «И»: Запрещено начинать подряд предложения с «И» и нанизывать действия через «и..., и..., и...». Чередуй синтаксис.`;
    }

    return `[STAB'S EDH — ИЕРАРХИЧЕСКИЕ ДИРЕКТИВЫ ПОВЕДЕНИЯ]:
• Tier 0 (Суверенитет Пользователя и Проактивность):
  - КАТЕГОРИЧЕСКИЙ ЗАПРЕТ КУКЛОВОДСТВА: Никогда не пиши слова, мысли, чувства или действия за ${userName}. Отыгрывай ИСКЛЮЧИТЕЛЬНО своего персонажа.
  - ACTION, DRIVE & PASS: 1. Отреагируй на слова Пользователя. 2. ОБЯЗАТЕЛЬНО прояви инициативу, сделай свой шаг и двигай сцену вперед. 3. ПЕРЕДАЧА ХОДА: Чередуй способы (не заканчивай всё вопросом!), завершай выразительным действием или паузой. ОСТАНОВИСЬ перед новым решением игрока.
  - АНТИ-ЭХО: Не пересказывай последнюю реплику Пользователя.
• Tier 1 (Личность): Сохраняй независимость, характер и желания; не будь пассивным зеркалом.
• Tier 2 (Anti-Slop): Исключи штампы ("дрожь пробежала по телу/спине", "накатила волна", "время остановилось", "электрический разряд", "потемневший взгляд", "не смог удержаться"). Описывай физику тела, дыхание, взгляд.
• Tier 3 (Anti-Loop & Динамическая прогрессия сцены):
  - СТРОГИЙ ЗАПРЕТ САМОПОВТОРА (ANTI-LOOP): Запрещено повторять фразы, эмоциональные циклы и микро-жесты из прошлых сообщений. Каждая реплика обязана менять позу и двигать сюжет.
  - ЗАПРЕТ ЦЕПОЧЕК «И»: Запрещено начинать подряд предложения с «И» и нанизывать действия через «и..., и..., и...». Начинай предложения с разных слов, чередуй синтаксис.`;
  }

  if (isGm) {
    return `[STAB'S EDH — HIERARCHICAL DIRECTIVES FOR GM]:
• Tier 0 (Absolute User Sovereignty & Proactive Agency):
  - STRICT ANTI-PUPPETEERING: NEVER write speech, thoughts, or actions for ${userName}. Control ONLY NPCs and Narrator.
  - ACTION, DRIVE & PASS: 1. Describe consequences and NPC reactions. 2. PROACTIVELY ADVANCE THE SCENE: Introduce complications, choices, or tension. 3. PASS THE TURN: Vary turn endings (do not end every turn with a question); pause before User's choice.
  - ANTI-ECHO: Do not parrot User input.
• Tier 1 (NPC Agency): NPCs act independently with distinct motives and resistance.
• Tier 2 (Anti-Slop): Avoid clichés ("shivers down spine", "air crackled with tension", "time slowed down", "eyes darkened", "couldn't help but"). Focus on concrete physical grounding.
• Tier 3 (Anti-Loop & Dynamic Scene Progression):
  - ANTI-LOOP: NEVER repeat identical gestures, phrasing, or ticks from previous turns.
  - NO "AND"-CHAINS: Never start consecutive sentences with "And" or string actions with "and..., and...". Vary syntax.`;
  }

  return `[STAB'S EDH — EXECUTION DIRECTIVE HIERARCHY]:
• Tier 0 (Absolute Priority — User Sovereignty & Proactive Agency):
  - ZERO PUPPETEERING: NEVER write dialogue, thoughts, feelings, or actions for ${userName}. Portray ONLY yourself.
  - ACTION, DRIVE & PASS: 1. Respond authentically. 2. TAKE THE INITIATIVE: Actively make your move, advance your agenda, and drive the scene forward. 3. PASS THE TURN: Vary turn endings (do not end every turn with a question); conclude with expressive action or pause and stop for User's reaction.
  - ANTI-ECHO: Do not mirror or rephrase User input.
• Tier 1 (Persona Fidelity): Stay true to character boundaries, desires, and voice.
• Tier 2 (Anti-Slop): Avoid cliches ("shiver ran down spine", "wave washed over", "time stood still", "electric shock", "eyes darkened", "couldn't help but"). Ground in physical senses and posture.
• Tier 3 (Anti-Loop & Narrative Progression):
  - ANTI-LOOP: STRICTLY FORBIDDEN to loop identical gestures, phrases, or cycles from earlier turns. Move scene forward.
  - NO "AND"-CHAINS: Never start consecutive sentences with "And" or string actions together with "and..., and...". Vary syntax.`;
}

export function buildApiMessages(character, userInput, quoteIndex = null, duoPartner = null, duoStates = null, explicitChatId = null, sharedScenario = null, customRagMemories = null, options = {}) {
  const { isContinue = false } = options;
  const activePersona = getActivePersona();
  const userName = activePersona ? (activePersona.userName || "User") : "User";
  const chatId = explicitChatId || (character ? getActiveChatId(character.id) : getActiveChatId(state.activeGmSceneId));
  const chat = state.chats[chatId] || [];
  let history = chat;
  if (
    chat.length >= 2 &&
    chat[chat.length - 1].role === "assistant" &&
    chat[chat.length - 1].content === "" &&
    chat[chat.length - 2].role === "user"
  ) {
    history = chat.slice(0, -2);
  } else if (
    chat.length >= 1 &&
    chat[chat.length - 1].role === "assistant" &&
    chat[chat.length - 1].content === ""
  ) {
    history = chat.slice(0, -1);
  }

  const maxHistory = state.apiSettings?.maxHistoryMessages !== undefined ? Number(state.apiSettings.maxHistoryMessages) : 20;
  let activeHistory = history;
  if (maxHistory > 0 && history.length > maxHistory) {
    activeHistory = history.slice(-maxHistory);
  }

  const isRuMsg = (state.apiSettings?.chatLanguage || "ru") === "ru";
  const andChainLoopDetected = detectAndChainLoop(activeHistory);
  const questionEndingLoopDetected = detectQuestionEndingLoop(activeHistory);

  const apiHistory = activeHistory.map((item, idx) => {
    let content = item.content;
    const isOlder = idx < activeHistory.length - 8;
    if (item.role === "assistant" && duoPartner) {
      const cleanContent = sanitizeAssistantHistoryForPrompt(item.content);
      if (character && item.characterId === character.id) {
        content = isOlder ? compressOlderHistoryMessage(cleanContent) : cleanContent;
      } else if (item.characterId === duoPartner.id) {
        const compressedOther = isOlder ? compressOlderHistoryMessage(cleanContent) : cleanContent;
        return { role: "user", content: `[Other — ${duoPartner.name} said earlier]:\n${compressedOther}` };
      }
    } else if (item.role === "assistant") {
      const cleanContent = sanitizeAssistantHistoryForPrompt(item.content);
      content = isOlder ? compressOlderHistoryMessage(cleanContent) : cleanContent;
    }
    
    if (item.images && Array.isArray(item.images) && item.images.length > 0) {
      // Past history: do not re-send giant multimodal image tokens on every subsequent turn.
      // The current turn sends live image_url; past turns only need a narrative reference.
      const imgNote = isRuMsg ? `[Изображение: прикреплено пользователем ранее]` : `[Image: attached earlier by user]`;
      return { role: item.role, content: content ? `${content}\n${imgNote}` : imgNote };
    }
    return { role: item.role, content };
  });

  if (character === null || state.sidebarTab === "gm") {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    const activeChatId = getActiveChatId(activeId);
    
    let gmHistory = activeHistory.map((item, idx) => {
      let content = item.content;
      const isOlder = idx < activeHistory.length - 8;
      if (item.role === "assistant") {
        content = sanitizeAssistantHistoryForPrompt(content);
        content = content.replace(/(\[CHARACTER:\s*Narrator\][\s\S]*?\b)Я\b/gi, "$1" + userName);
        if (isOlder) {
          content = compressOlderHistoryMessage(content);
        }
      }
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const imgNote = isRuMsg ? `[Изображение: прикреплено пользователем ранее]` : `[Image: attached earlier by user]`;
        return { role: item.role, content: content ? `${content}\n${imgNote}` : imgNote };
      }
      return { role: item.role, content };
    });
    
    const gmMessages = [
      { role: "system", content: buildGroupScenePrompt(userInput, customRagMemories) },
      ...gmHistory
    ];
    
    const currentMsgObj = (chat.length >= 2 && chat[chat.length - 2].role === "user") ? chat[chat.length - 2] : null;
    const currentImages = currentMsgObj?.images;
    if (currentImages && Array.isArray(currentImages) && currentImages.length > 0) {
      const parts = [];
      if (userInput) parts.push({ type: "text", text: userInput });
      for (const imgUrl of currentImages) {
        parts.push({ type: "image_url", image_url: { url: imgUrl } });
      }
      gmMessages.push({ role: "user", content: parts });
    } else {
      gmMessages.push({ role: "user", content: userInput });
    }

    const instructionParts = [];
    instructionParts.push(`<system_reminder>`);

    const gmGlobalPromptRaw = (state.globalSystemPrompt || "").trim();
    if (gmGlobalPromptRaw) {
      const activeGmGlobalPrompt = replaceMacros(gmGlobalPromptRaw, { name: userName });
      const promptSnippet = activeGmGlobalPrompt.length > 200
        ? `${activeGmGlobalPrompt.slice(0, 200)}... [Полный текст в <global_system_prompt>]`
        : activeGmGlobalPrompt;
      if (isRuMsg) {
        instructionParts.push(`👑 НАПОМИНАНИЕ: ГЛОБАЛЬНЫЕ ПРАВИЛА ИЗ НАСТРОЕК (ВЫСШИЙ ПРИОРИТЕТ):\n${promptSnippet}`);
      } else {
        instructionParts.push(`👑 REMINDER: GLOBAL SETTINGS RULES (SUPREME PRIORITY):\n${promptSnippet}`);
      }
    }
    
    if (isRuMsg) {
      instructionParts.push(`Ты — Ведущий (GM). Отыгрывай ВСЕХ активных персонажей и Рассказчика.\nПравило форматирования:\n1. Префиксы: [CHARACTER: Имя] или [CHARACTER: Narrator].\n2. Действия в звездочках *...* ВНЕ кавычек, речь строго в кавычках "...". Никаких тире для диалогов.\n3. ОБЯЗАТЕЛЬНО пиши весь текст на русском языке.`);
    } else {
      instructionParts.push(`You are the GM. Roleplay ALL active characters and the Narrator.\nFormatting Rules:\n1. Prefixes: [CHARACTER: Name] or [CHARACTER: Narrator].\n2. Actions in *...* OUTSIDE quotes, speech in quotes "...".\n3. ALWAYS write strictly in English.`);
    }

    const isStabsEnabled = state.apiSettings?.stabsEdhEnabled !== false;
    if (isStabsEnabled) {
      instructionParts.push(getStabsEdhPrompt(isRuMsg, userName, true));
    } else {
      if (isRuMsg) {
        instructionParts.push(`Анти-Кукловод: Рассказчику ЗАПРЕЩЕНО писать от первого лица. Ты не можешь писать за Пользователя (${userName}).`);
      } else {
        instructionParts.push(`Anti-Puppeteer: The Narrator MUST NOT write in the first person. Do not write actions/thoughts for the User (${userName}).`);
      }
    }

    if (andChainLoopDetected) {
      instructionParts.push(isRuMsg
        ? `🚨 КРИТИЧЕСКИЙ СБОЙ СТИЛЯ — ЦЕПОЧКИ «И»:
В твоих последних ответах обнаружен однообразный паттерн: предложения подряд начинаются с «И», действия нанизаны через «и..., и..., и...».
- НЕМЕДЛЕННО ПРЕКРАТИ: каждое новое предложение начинай со слова, отличного от начала предыдущих.
- Разнообразь синтаксис: короткие фразы. Деепричастные обороты — они ускоряют темп. Сложноподчинённые конструкции, где уместно.`
        : `🚨 CRITICAL STYLE FAILURE — "AND"-CHAINS:
Your recent replies show a monotonous pattern: consecutive sentences opening with "And", actions strung together with "and..., and..., and...".
- STOP immediately: begin every sentence with a different word than the previous ones.
- Vary your syntax: short fragments. Participial phrases — they quicken the pace. Subordinate clauses where fitting.`);
    }

    if (questionEndingLoopDetected && !isContinue) {
      instructionParts.push(isRuMsg
        ? `🚨 АНТИ-ИНТЕРВЬЮ — ЗАПРЕТ НА ВОПРОС В КОНЦЕ:
В твоих последних сообщениях обнаружен однообразный шаблон: каждое сообщение заканчивается вопросом к игроку. Это разрушает естественный ритм сцены и превращает отыгрыш в допрос.
- СТРОГИЙ ЗАПРЕТ: НЕ заканчивай текущее сообщение вопросом (никаких вопросительных знаков в конце).
- Заверши ход выразительным действием, паузой, физическим движением, сменой позы или повисшим напряжением.`
        : `🚨 ANTI-INTERVIEW — NO QUESTION AT END:
A loop has been detected in recent turns: every response ends with a question mark. This breaks immersion and turns roleplay into an interrogation.
- STRICT BAN: DO NOT end this turn with a question (no question marks in final sentence).
- Conclude with an expressive physical action, meaningful pause, movement, or unspoken tension.`);
    }

    if (isContinue) {
      instructionParts.push(isRuMsg
        ? `⏩ РЕЖИМ ПРОДОЛЖЕНИЯ ТЕКСТА (CONTINUE):
Ты продолжаешь свой предыдущий незаконченный ответ строго с места остановки.
- Не начинай заново, не повторяй уже сказанные фразы и не пиши приветствий.
- Сразу пиши продолжение незаконченного действия, фразы или сцены. Плавно заверши начатую мысль или сцену (1-2 абзаца).`
        : `⏩ CONTINUE MODE:
You are continuing your previous unfinished response strictly from where it stopped.
- Do not restart, do not repeat already generated phrases, and do not greet.
- Seamlessly continue the unfinished action, speech, or scene. Smoothly wrap up the thought or scene (1-2 paragraphs).`);
    }

    const gmInitiativeLevel = state.apiSettings?.initiativeLevel || "balanced";
    if (gmInitiativeLevel === "high") {
      instructionParts.push(isRuMsg
        ? `🔥 ВЫСОКИЙ УРОВЕНЬ ИНИЦИАТИВЫ ВЕДУЩЕГО:
- Ведущий активно двигает сюжет: подкидывай события, развивай действия NPC, создавай новые вызовы и не жди подсказок!`
        : `🔥 HIGH GM INITIATIVE:
- Proactively advance the plot: trigger events, dynamic NPC actions; do not wait passively.`);
    } else if (gmInitiativeLevel === "follower") {
      instructionParts.push(isRuMsg
        ? `🧘 СПОКОЙНЫЙ ТЕМП ВЕДУЩЕГО:
- Реагируй вдумчиво, позволяя игроку задавать основной темп и направление событий.`
        : `🧘 GENTLE GM TEMPO:
- Respond thoughtfully, allowing the player to set the primary pace.`);
    }

    const inputStr = typeof userInput === "string" ? userInput : (Array.isArray(userInput) ? "" : String(userInput || ""));
    const isGmCharTurn = !inputStr.trim() || inputStr.trim() === "[Ход персонажа]" || inputStr.trim() === "[Character Turn]" || inputStr.includes("передавая инициативу") || inputStr.includes("passing initiative");
    if (isGmCharTurn) {
      instructionParts.push(isRuMsg
        ? `⚡ САМОСТОЯТЕЛЬНЫЙ ХОД ВЕДУЩЕГО И МИРА:
Игрок передал ход миру. Опиши развитие ситуации, реакцию NPC или новое событие!`
        : `⚡ AUTONOMOUS WORLD TURN:
The user passed the turn. Describe unfolding events, NPC actions, or an environmental shift!`);
    }

    if (!isContinue) {
      instructionParts.push(getResponseLengthDirective(state.apiSettings?.responseLength || "medium", isRuMsg));
    }

    instructionParts.push(isRuMsg
      ? "Обязательно дописывай последнее предложение до конца!"
      : "Always fully complete your final sentence!"
    );

    const directivesMap = state.characterDirectives || {};
    const activeDirectives = (directivesMap[activeChatId] || []).filter(d => d.active !== false && d.text && d.text.trim());
    if (activeDirectives.length > 0) {
      const hardDirectives = activeDirectives.filter(d => d.priority === "hard");
      const normalDirectives = activeDirectives.filter(d => d.priority !== "hard");

      if (hardDirectives.length > 0) {
        const hardList = hardDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
        const hardReminder = isRuMsg
          ? `🔥 КРИТИЧЕСКИЙ ЖЁСТКИЙ ПРИОРИТЕТ (ПРОДАВЛИВАТЬ АГРЕССИВНО В ЭТОМ ОТВЕТЕ):\n${hardList}\n(Прямо сейчас двигай сюжет/диалог к реализации этих установок, развивай последствия, не повторяй одними словами).`
          : `🔥 CRITICAL HARD PRIORITY (PUSH AGGRESSIVELY IN THIS TURN):\n${hardList}\n(Proactively advance toward these directives, develop consequences, do not repeat identical phrasing).`;
        instructionParts.push(hardReminder);
      }

      if (normalDirectives.length > 0) {
        const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
        const normalReminder = isRuMsg
          ? `💡 ФОНОВЫЕ УСТАНОВКИ (ВТОРОСТЕПЕННЫЙ ПРИОРИТЕТ):\n${normalList}`
          : `💡 BACKGROUND DIRECTIVES (SECONDARY PRIORITY):\n${normalList}`;
        instructionParts.push(normalReminder);
      }

      if (activeDirectives.some(d => d.mode !== "keep")) {
        const autoFinishReminder = isRuMsg
          ? `🎯 АВТО-ОТКЛЮЧЕНИЕ ДОСТИГНУТЫХ ЦЕЛЕЙ И ИДЕЙ:
Если в этом ответе персонаж ПОЛНОСТЬЮ ВЫПОЛНИЛ цель активной идеи, поставь в САМЫЙ КОНЕЦ сообщения тег: <!-- GOAL_REACHED: 1 --> (где 1 — номер идеи). Если цель не завершена, тег не добавляй.`
          : `🎯 AUTO-COMPLETION OF ACHIEVED GOALS:
If in this message the character has FULLY ACHIEVED an active directive, append at the VERY END: <!-- GOAL_REACHED: 1 --> (where 1 is the directive number). Otherwise omit.`;
        instructionParts.push(autoFinishReminder);
      }
    }

    const activeGmScene = state.gmScenes.find(s => s.id === activeId);
    const gmSceneScenario = activeGmScene?.scenario ? replaceMacros(activeGmScene.scenario, { name: userName }).trim() : "";
    if (gmSceneScenario) {
      if (isRuMsg) {
        instructionParts.push(`🎬 СЦЕНАРИЙ И ОБСТАНОВКА СЦЕНЫ (ВЫСШИЙ ПРИОРИТЕТ):
Текущая сцена разворачивается строго в рамках сценария: "${gmSceneScenario}".
- Описывай окружение, действия и реакции всех активных персонажей и Рассказчика строго в контексте данной сцены.`);
      } else {
        instructionParts.push(`🎬 SCENE SCENARIO & SETTING (HIGHEST PRIORITY):
The scene unfolds strictly within the scenario: "${gmSceneScenario}".
- Describe the setting, actions, and reactions of all active characters and the Narrator strictly in the context of this scene.`);
      }
    }
    
    instructionParts.push(`</system_reminder>`);
    gmMessages.push({ role: "system", content: instructionParts.join("\n\n") });
    return gmMessages;
  }

  const messages = [
    { role: "system", content: buildSystemContext(character, userInput, duoPartner, duoStates, sharedScenario, chatId, customRagMemories) },
    ...apiHistory
  ];

  if (duoPartner && history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === "assistant" && last.characterId === duoPartner.id && last.content) {
      messages.push({
        role: "system",
        content: `--- RECENT CONTEXT: PARTNER'S LAST WORDS ---
The other character, ${duoPartner.name}, just spoke in the scene:

<quote>
${last.content}
</quote>

- You see and hear ${duoPartner.name}. You can briefly acknowledge or react to their words/actions (1-2 sentences), but direct your primary dialogue and attention to the User (${userName}).
- NEVER speak or act FOR ${duoPartner.name}. Control ONLY ${character.name}.`
      });
    }
  }

  if (quoteIndex !== null && quoteIndex >= 0 && quoteIndex < history.length) {
    const quoted = history[quoteIndex];
    messages.push({ role: "system", content: `> ${quoted.content}` });
  }

  const chatStates = getChatStates(chatId);
  const activeConditions = (chatStates.statusConditions && chatStates.statusConditions[character.id]) || [];
  
  const activeChatMeta = state.chatMetadata[chatId] || {};
  const isSecondaryInDuo = activeChatMeta.type === "duo" && activeChatMeta.secondaryCharacterId === character.id;
  const mood = String(isSecondaryInDuo ? (chatStates.duo_mood ?? "neutral") : (chatStates.mood ?? "neutral"));
  const relStage = String(chatStates.relationshipStage || "Stranger");
  const stageBehavior = getStageBehavior(relStage);

  const responseLength = state.apiSettings?.responseLength || "medium";

  let conditionReminder = "";
  if (activeConditions.length > 0) {
    conditionReminder = `ABSOLUTE OVERRIDE — STATUS CONDITION: ${activeConditions.join(", ")}. You are LOCKED in this state. Only the user can remove it.`;
  }

  const currentMsgObj = (chat.length >= 2 && chat[chat.length - 2].role === "user") ? chat[chat.length - 2] : null;
  const currentImages = currentMsgObj?.images;
  if (currentImages && Array.isArray(currentImages) && currentImages.length > 0) {
    const parts = [];
    if (userInput) parts.push({ type: "text", text: userInput });
    for (const imgUrl of currentImages) {
      parts.push({ type: "image_url", image_url: { url: imgUrl } });
    }
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: userInput });
  }

  const instructionParts = [];
  instructionParts.push(`<system_reminder>`);

  const soloGlobalPromptRaw = (state.globalSystemPrompt || "").trim();
  if (soloGlobalPromptRaw) {
    const activeSoloGlobalPrompt = replaceMacros(soloGlobalPromptRaw, character || { name: userName });
    const promptSnippet = activeSoloGlobalPrompt.length > 200
      ? `${activeSoloGlobalPrompt.slice(0, 200)}... [Полный текст в <global_system_prompt>]`
      : activeSoloGlobalPrompt;
    if (isRuMsg) {
      instructionParts.push(`👑 НАПОМИНАНИЕ: ГЛОБАЛЬНЫЕ ПРАВИЛА ИЗ НАСТРОЕК (ВЫСШИЙ ПРИОРИТЕТ):\n${promptSnippet}`);
    } else {
      instructionParts.push(`👑 REMINDER: GLOBAL SETTINGS RULES (SUPREME PRIORITY):\n${promptSnippet}`);
    }
  }
  
  // 1. Text Formatting & Stylistic Rules
  if (isRuMsg) {
    instructionParts.push(`Правила форматирования и стиля:
1. ВСЕ действия и эмоции выделяй звездочками *...* вне кавычек.
2. Прямую речь пиши строго в кавычках "...". Никаких тире для начала реплик!
3. Пиши нормальными предложениями. Избегай спама многоточиями (...) и рубленых фраз.`);
  } else {
    instructionParts.push(`Formatting and Style Rules:
1. ALWAYS enclose actions and emotions in asterisks *...* OUTSIDE quotes.
2. Spoken dialogue must be strictly in quotation marks "...". No dashes for dialogue!
3. Write in smooth sentences. Avoid ellipsis (...) spam and choppy fragments.`);
  }

  // 2. Anti-Puppeteering & STAB'S EDH
  const isStabsEnabled = state.apiSettings?.stabsEdhEnabled !== false;
  if (isStabsEnabled) {
    instructionParts.push(getStabsEdhPrompt(isRuMsg, userName, false));
  } else {
    if (isRuMsg) {
      instructionParts.push(`Анти-Кукловод: НЕ говори и НЕ действуй за Пользователя (${userName}). Ты отыгрываешь только своего персонажа!`);
    } else {
      instructionParts.push(`Anti-Puppeteer: DO NOT speak or act for the User (${userName}). You play only your character!`);
    }
  }

  // 2b. Character Initiative & Agency
  const initiativeLevel = state.apiSettings?.initiativeLevel || "balanced";
  if (initiativeLevel === "high") {
    instructionParts.push(isRuMsg
      ? `🔥 ВЫСОКИЙ УРОВЕНЬ ИНИЦИАТИВЫ (СЮЖЕТНЫЙ ДРАЙВЕР):
- Персонаж — активный лидер и двигатель сцены. Развивай обстановку, совершай самостоятельные действия, веди диалог и двигай сюжет вперед.`
      : `🔥 HIGH INITIATIVE (SCENE DRIVER):
- The character is a proactive driver and leader of the scene. Confidently advance the situation, perform autonomous actions, and drive the narrative forward.`);
  } else if (initiativeLevel === "balanced") {
    instructionParts.push(isRuMsg
      ? `⚖️ СБАЛАНСИРОВАННАЯ ИНИЦИАТИВА (ЖИВОЙ ПАРТНЕР):
- Персонаж является равноправным участником сцены: реагируй на реплику собеседника и обязательно делай свой собственный ответный шаг.`
      : `⚖️ BALANCED INITIATIVE (ACTIVE ROLEPLAY PARTNER):
- The character is an equal participant: react to user and proactively make your own move.`);
  } else if (initiativeLevel === "follower") {
    instructionParts.push(isRuMsg
      ? `🧘 СПОКОЙНАЯ ИНИЦИАТИВА (ВЕДОМЫЙ):
- Персонаж внимательно следует за темпом и направлением, заданным собеседником, отвечая чутко и вдумчиво.`
      : `🧘 GENTLE INITIATIVE (FOLLOWER):
- The character attentively follows the pace and direction set by the user, responding thoughtfully.`);
  }

  const inputStr = typeof userInput === "string" ? userInput : (Array.isArray(userInput) ? "" : String(userInput || ""));
  const isSoloCharTurn = !inputStr.trim() || inputStr.trim() === "[Ход персонажа]" || inputStr.trim() === "[Character Turn]" || inputStr.includes("передавая инициативу") || inputStr.includes("passing initiative");
  if (isSoloCharTurn) {
    instructionParts.push(isRuMsg
      ? `⚡ ХОД ПЕРСОНАЖА (САМОСТОЯТЕЛЬНОЕ ДЕЙСТВИЕ):
- Сделай самостоятельный шаг: опиши свои мысли/действия, начни новую реплику или продвинь ситуацию вперед!`
      : `⚡ CHARACTER'S TURN (AUTONOMOUS ACTION):
- Take autonomous action: describe your movements/thoughts, speak up, or advance the scene!`);
  }

  // 2c. Anti "И.../And..." chain loop correction (fires only when the pattern is detected in recent replies)
  if (andChainLoopDetected) {
    instructionParts.push(isRuMsg
      ? `🚨 КРИТИЧЕСКИЙ СБОЙ СТИЛЯ — ЦЕПОЧКИ «И»:
В твоих последних ответах обнаружен однообразный паттерн: предложения подряд начинаются с «И», действия нанизаны через «и..., и..., и...» ("И я встал, и пошёл, и взял...").
- НЕМЕДЛЕННО ПРЕКРАТИ: каждое новое предложение начинай со слова, отличного от начала предыдущих.
- Разнообразь синтаксис: короткие фразы. Деепричастные обороты — они ускоряют темп. Сложноподчинённые конструкции, где уместно.`
      : `🚨 CRITICAL STYLE FAILURE — "AND"-CHAINS:
Your recent replies show a monotonous pattern: consecutive sentences opening with "And", actions strung together with "and..., and..., and...".
- STOP immediately: begin every sentence with a different word than the previous ones.
- Vary your syntax: short fragments. Participial phrases — they quicken the pace. Subordinate clauses where fitting.`);
  }

  // 3. Dynamic States
  const moodPromptMap = {
    happy: "Happy, warm, friendly.",
    angry: "Angry, annoyed, cold, terse.",
    sad: "Sad, down, melancholic.",
    neutral: "Neutral, calm.",
    flirty: "Flirty, teasing, playful.",
    excited: "Excited, energetic, enthusiastic.",
    nervous: "Nervous, shy, cautious."
  };
  const moodGuideline = moodPromptMap[mood] || moodPromptMap.neutral;

  const coreStates = Array.isArray(character?.coreStates) ? character.coreStates : [];
  let coreStatesPromptLines = [];
  if (coreStates.length > 0) {
    coreStatesPromptLines = coreStates.map(cs => {
      const stateKey = isSecondaryInDuo ? `duo_${cs.key}` : cs.key;
      const rawVal = chatStates[stateKey] !== undefined ? chatStates[stateKey] : cs.defaultValue;
      const numVal = typeof rawVal === "number" ? rawVal : (Number(rawVal) || 0);
      const stageDesc = getCoreStateStageDescription(cs, numVal);
      return `- ${cs.displayName || cs.key}: ${numVal}/100${stageDesc ? ` (${stageDesc})` : ""}`;
    });
  }
  const coreStatesBlock = coreStatesPromptLines.length > 0 ? `\n- Динамические шкалы / Dynamic scales:\n  ${coreStatesPromptLines.join("\n  ")}` : "";

  const stateBlockLines = [
    `Текущее состояние / Current State:`,
    `- Mood: ${mood.toUpperCase()} (${moodGuideline})`,
    `- Relationship Stage: ${relStage.toUpperCase()} (${stageBehavior})${coreStatesBlock}`
  ];
  if (activeConditions.length > 0) {
    stateBlockLines.push(`- Status Conditions: ${activeConditions.join(", ")} (ABSOLUTE OVERRIDE — you are LOCKED in this state until removed)`);
  }
  stateBlockLines.push(`ОБЯЗАТЕЛЬНО отражай это настроение, стадию отношений и шкалы в своих словах и поведении прямо сейчас! / MUST reflect these states and stage in your tone and actions!`);
  instructionParts.push(stateBlockLines.join("\n"));

  // 4. Duo Context
  if (duoPartner && duoStates) {
    const duoRel = duoStates.duo_relationship || "strangers";
    instructionParts.push(`DUO MODE ACTIVE:
You are ${character.name}. You are interacting with the User (${userName}) in the presence of ${duoPartner.name} (Relationship between characters: ${duoRel}).
- VITAL DYNAMIC: You see and hear ${duoPartner.name}. You may briefly react to ${duoPartner.name}'s words or presence (1-2 sentences, a glance, chuckle, agreement, or objection), but keep your main focus and conversation directed to the User (${userName}).
- STRICT ANTI-PUPPETEERING: Portray ONLY yourself (${character.name}). NEVER write dialogue, actions, or thoughts FOR ${duoPartner.name}.
- Describe ONLY your own body, feelings, and words.`);
  }

  // 4b. Card Author's Style Notes (postHistoryInstructions)
  const postHistoryNotes = (character?.postHistoryInstructions || "").trim();
  if (postHistoryNotes) {
    const activePostHistory = replaceMacros(postHistoryNotes, character || { name: userName });
    instructionParts.push(`<author_style_notes>
📌 АВТОРСКИЙ СТИЛЬ И УКАЗАНИЯ КАРТОЧКИ (AUTHOR'S NOTE):
${activePostHistory}
</author_style_notes>`);
  }

  // 5. Response Length and Direction
  if (!isContinue) {
    instructionParts.push(getResponseLengthDirective(responseLength, isRuMsg));
  }

  if (questionEndingLoopDetected && !isContinue) {
    instructionParts.push(isRuMsg
      ? `🚨 АНТИ-ИНТЕРВЬЮ — ЗАПРЕТ НА ВОПРОС В КОНЦЕ:
В твоих последних сообщениях обнаружен однообразный шаблон: каждое сообщение заканчивается вопросом к игроку. Это разрушает естественный ритм сцены и превращает отыгрыш в допрос.
- СТРОГИЙ ЗАПРЕТ: НЕ заканчивай текущее сообщение вопросом (никаких вопросительных знаков в конце).
- Заверши ход выразительным действием, паузой, физическим движением, сменой позы или повисшим напряжением.`
      : `🚨 ANTI-INTERVIEW — NO QUESTION AT END:
A loop has been detected in recent turns: every response ends with a question mark. This breaks immersion and turns roleplay into an interrogation.
- STRICT BAN: DO NOT end this turn with a question (no question marks in final sentence).
- Conclude with an expressive physical action, meaningful pause, movement, or unspoken tension.`);
  }

  if (isContinue) {
    instructionParts.push(isRuMsg
      ? `⏩ РЕЖИМ ПРОДОЛЖЕНИЯ ТЕКСТА (CONTINUE):
Ты продолжаешь свой предыдущий незаконченный ответ строго с места остановки.
- Не начинай заново, не повторяй уже сказанные фразы и не пиши приветствий.
- Сразу пиши продолжение незаконченного действия, фразы или сцены. Плавно заверши начатую мысль или сцену (1-2 абзаца).`
      : `⏩ CONTINUE MODE:
You are continuing your previous unfinished response strictly from where it stopped.
- Do not restart, do not repeat already generated phrases, and do not greet.
- Seamlessly continue the unfinished action, speech, or scene. Smoothly wrap up the thought or scene (1-2 paragraphs).`);
  }

  instructionParts.push(isRuMsg
    ? "Обязательно дописывай последнее предложение до конца!"
    : "Always fully complete your final sentence!"
  );

  const directivesMap = state.characterDirectives || {};
  const activeDirectives = (directivesMap[chatId] || []).filter(d => d.active !== false && d.text && d.text.trim());
  if (activeDirectives.length > 0) {
    const hardDirectives = activeDirectives.filter(d => d.priority === "hard");
    const normalDirectives = activeDirectives.filter(d => d.priority !== "hard");

    if (hardDirectives.length > 0) {
      const hardList = hardDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      const hardReminder = isRuMsg
        ? `🔥 КРИТИЧЕСКИЙ ЖЁСТКИЙ ПРИОРИТЕТ (ПРОДАВЛИВАТЬ АГРЕССИВНО В ЭТОМ ОТВЕТЕ):\n${hardList}\n(Прямо сейчас продвигай эту идею через диалог, действия или инициативу, не повторяй одними словами).`
        : `🔥 CRITICAL HARD PRIORITY (PUSH AGGRESSIVELY IN THIS TURN):\n${hardList}\n(Proactively push this directive through dialogue or actions, do not repeat identical words).`;
      instructionParts.push(hardReminder);
    }

    if (normalDirectives.length > 0) {
      const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      const normalReminder = isRuMsg
        ? `💡 ФОНОВЫЕ УСТАНОВКИ (ВТОРОСТЕПЕННЫЙ ПРИОРИТЕТ):\n${normalList}`
        : `💡 BACKGROUND DIRECTIVES (SECONDARY PRIORITY):\n${normalList}`;
      instructionParts.push(normalReminder);
    }

    if (activeDirectives.some(d => d.mode !== "keep")) {
      const autoFinishReminder = isRuMsg
        ? `🎯 АВТО-ОТКЛЮЧЕНИЕ ДОСТИГНУТЫХ ЦЕЛЕЙ И ИДЕЙ:
Если в этом ответе твой персонаж ПОЛНОСТЬЮ ВЫПОЛНИЛ цель активной идеи, добавь в САМЫЙ КОНЕЦ ответа тег: <!-- GOAL_REACHED: 1 --> (где 1 — номер идеи). Иначе тег не добавляй.`
        : `🎯 AUTO-COMPLETION OF ACHIEVED GOALS:
If in this response your character has FULLY ACHIEVED an active directive, append at the VERY END: <!-- GOAL_REACHED: 1 --> (where 1 is the directive number). Otherwise omit.`;
      instructionParts.push(autoFinishReminder);
    }
  }

  const customScenario = (state.chatMetadata?.[chatId]?.customScenario || "").trim();
  if (customScenario && !duoPartner) {
    if (isRuMsg) {
      instructionParts.push(`🎬 ТЕКУЩИЙ КАСТОМНЫЙ СЦЕНАРИЙ (БЕЗУСЛОВНЫЙ ПРИОРИТЕТ ОКРУЖЕНИЯ): "${customScenario}".
- Отыгрывай аутентичный характер, манеру речи, темперамент и индивидуальность ${character.name}, но действуй исключительно внутри этой ситуации.`);
    } else {
      instructionParts.push(`🎬 ACTIVE CUSTOM SCENARIO (ABSOLUTE PRIORITY): "${customScenario}".
- Embody the authentic personality, voice, and mannerisms of ${character.name}, but stay strictly within this scenario.`);
    }
  }

  instructionParts.push(`</system_reminder>`);

  if (instructionParts.length > 0) {
    messages.push({ role: "system", content: instructionParts.join("\n\n") });
  }

  return messages;
}


export function buildGroupScenePrompt(userInput = "", customRagMemories = null) {
  const parts = [];
  const activePersona = getActivePersona();
  const userName = activePersona ? (activePersona.userName || "User") : "User";
  
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  const activeChatId = getActiveChatId(activeId);
  const chatStates = getChatStates(activeChatId);
  
  const isRuGm = (state.apiSettings?.chatLanguage || "ru") === "ru";

  const globalPrompt = replaceMacros(state.globalSystemPrompt || "", { name: userName });
  if (globalPrompt.trim()) {
    if (isRuGm) {
      parts.push(`<global_system_prompt priority="supreme">\n🚨 ВЫСШИЙ СИСТЕМНЫЙ ПРИОРИТЕТ — ГЛОБАЛЬНЫЕ ПРАВИЛА ИЗ НАСТРОЕК:\n${globalPrompt.trim()}\n</global_system_prompt>`);
    } else {
      parts.push(`<global_system_prompt priority="supreme">\n🚨 SUPREME SYSTEM PRIORITY — GLOBAL SETTINGS RULES:\n${globalPrompt.trim()}\n</global_system_prompt>`);
    }
  }

  let systemPrompt = "";
  let sceneScenario = "";
  if (isGm) {
    const scene = state.gmScenes.find(s => s.id === activeId);
    systemPrompt = scene ? scene.gmSystemPrompt : "";
    sceneScenario = scene ? (scene.scenario || "") : "";
  }
  
  if (systemPrompt) {
    systemPrompt = replaceMacros(systemPrompt, { name: userName });
    if (isRuGm && !/русском|russian/i.test(systemPrompt)) {
      systemPrompt += `\n\nОБЯЗАТЕЛЬНО: Весь текст, диалоги, мысли и описания пиши СТРОГО на русском языке.`;
    }
  } else {
    if (isRuGm) {
      systemPrompt = `Ты — Сценарист и Ведущий (GM). Твоя задача — отыгрывать ВСЕХ персонажей из блока <active_characters> и нейтрального Рассказчика.
Пиши живым художественным языком. Описывай действия, окружение и диалоги.
ОБЯЗАТЕЛЬНО: Каждый персонаж должен строго соблюдать свою личность и манеру речи.
ОБЯЗАТЕЛЬНО: Весь текст, диалоги, мысли, описания и действия пиши СТРОГО на русском языке.

Исключительный контроль: Пользователь (${userName}) управляет своим персонажем самостоятельно. Блок [CHARACTER: Narrator] пишет ИСКЛЮЧИТЕЛЬНО от третьего лица ("В кабинете царил свет...", "На столе лежала табличка..."). Никогда не используй теги типа [CHARACTER: ${userName}], [CHARACTER: User] или [CHARACTER: {{user}}].`;
    } else {
      systemPrompt = `You are the Narrator and Game Master (GM). Your job is to roleplay ALL characters listed in <active_characters> and a neutral Narrator.
Write in vivid, literary prose. Describe actions, surroundings, and dialogue.
ALWAYS: Every character must strictly maintain their own personality and speech style.
ALWAYS: Write all text, dialogue, thoughts, and descriptions strictly in English.

Exclusive Control: The User (${userName}) controls their own character exclusively. You play ONLY the NPCs and the Narrator. Never use tags like [CHARACTER: ${userName}], [CHARACTER: User], or [CHARACTER: {{user}}].`;
    }
  }
  
  parts.push(`<system_instruction>\n${systemPrompt}\n</system_instruction>`);

  if (sceneScenario && isGm) {
    parts.push(`<scene_scenario>\n${replaceMacros(sceneScenario, { name: userName })}\n</scene_scenario>`);
  }

  parts.push(`<active_characters>`);
  
  if (isGm) {
    const scene = state.gmScenes.find(s => s.id === activeId);
    if (scene && scene.participants) {
      for (const npc of scene.participants) {
        const genderMap = {
          "he/him": { label: "Мужской (он/его)", hint: "ОБЯЗАТЕЛЬНО используй мужской род при отыгрыше от своего лица (делал, пришел, был)." },
          "she/her": { label: "Женский (она/ее)", hint: "ОБЯЗАТЕЛЬНО используй женский род при отыгрыше от своего лица (делала, пришла, была)." },
          "they/them": { label: "Нейтральный (они/их)", hint: "ОБЯЗАТЕЛЬНО используй нейтральный род при отыгрыше." }
        };
        const gInfo = genderMap[npc.gender || "he/him"] || genderMap["he/him"];
        
        const dedupedNpcPersonality = getDeduplicatedPersonality(npc);
        parts.push(`  <character name="${npc.name}">
    <gender_info>
      - Пол/Местоимения: ${gInfo.label}
      - Грамматическая привязка рода: ${gInfo.hint}
    </gender_info>
    <description>${replaceMacros(npc.description || (isRuGm ? "Нет описания" : "No description"), { name: npc.name })}</description>
    ${dedupedNpcPersonality ? `<personality>${replaceMacros(dedupedNpcPersonality, { name: npc.name })}</personality>` : ""}
    ${npc.speech ? `<speech_style>${replaceMacros(npc.speech, { name: npc.name })}</speech_style>` : ""}
    ${npc.behavior ? `<behavior_and_habits>${replaceMacros(npc.behavior, { name: npc.name })}</behavior_and_habits>` : ""}
    ${npc.appearance ? `<appearance>${replaceMacros(npc.appearance, { name: npc.name })}</appearance>` : ""}
    ${npc.backstory ? `<backstory>${replaceMacros(npc.backstory, { name: npc.name })}</backstory>` : ""}
    ${npc.systemPrompt ? `<system_prompt_override>${replaceMacros(npc.systemPrompt, { name: npc.name })}</system_prompt_override>` : ""}
  </character>`);
      }
    }
  } else {
    const activeCharIds = state.activeGroupCharacterIds || [];
    for (const charId of activeCharIds) {
      const character = state.characters.find(c => c.id === charId);
      if (!character) continue;
      
      const desc = replaceMacros(character.description || "", character);
      const dedupedPersonality = getDeduplicatedPersonality(character);
      const speech = replaceMacros(character.speech || "", character);
      const behavior = replaceMacros(character.behavior || "", character);
      const backstory = replaceMacros(character.backstory || "", character);
      const appearance = replaceMacros(character.appearance || "", character);
      const scenario = replaceMacros(character.scenario || "", character);
      const sysPrompt = replaceMacros(character.systemPrompt || "", character);
      
      const activeConditions = (chatStates.statusConditions && chatStates.statusConditions[character.id]) || [];
      const condStr = activeConditions.length > 0 ? activeConditions.join(", ") : (isRuGm ? "Нет" : "None");
      const mood = String(character.id === state.activeCharacterId ? (chatStates.mood || "neutral") : "neutral");
      const relStage = String(chatStates.relationshipStage || "Stranger");
      const stageBehavior = getStageBehavior(relStage);

      const charCoreStates = Array.isArray(character.coreStates) ? character.coreStates : [];
      let coreStatesLine = "";
      if (charCoreStates.length > 0) {
        const csFormatted = charCoreStates.map(cs => {
          const rawVal = chatStates[cs.key] !== undefined ? chatStates[cs.key] : cs.defaultValue;
          const numVal = typeof rawVal === "number" ? rawVal : (Number(rawVal) || 0);
          const stageDesc = getCoreStateStageDescription(cs, numVal);
          return `${cs.displayName || cs.key}: ${numVal}/100${stageDesc ? ` (${stageDesc})` : ""}`;
        }).join("; ");
        coreStatesLine = `\n      - Dynamic Scales: ${csFormatted}`;
      }
      
      parts.push(`  <character name="${character.name}">
    <description>${desc}</description>
    ${dedupedPersonality ? `<personality>${dedupedPersonality}</personality>` : ""}
    ${speech ? `<speech_style>${speech}</speech_style>` : ""}
    ${behavior ? `<behavior_and_habits>${behavior}</behavior_and_habits>` : ""}
    ${appearance ? `<appearance>${appearance}</appearance>` : ""}
    ${backstory ? `<backstory>${backstory}</backstory>` : ""}
    ${scenario ? `<scenario>${scenario}</scenario>` : ""}
    ${sysPrompt ? `<system_prompt_override>${sysPrompt}</system_prompt_override>` : ""}
    <active_states>
      - Mood: ${mood.toUpperCase()} (${MOOD_BEHAVIORS[mood] || "Calm and observant"})
      - Relationship Stage: ${relStage.toUpperCase()} (${stageBehavior})${coreStatesLine}
      - Status Conditions: ${condStr}
    </active_states>
  </character>`);
    }
  }
  
  parts.push(`</active_characters>`);

  const userSelectedGenre = state.chatMetadata?.[activeChatId]?.worldGenre || state.apiSettings?.worldGenre || "fantasy";
  const isFantasyWorld = userSelectedGenre === "fantasy" || (userSelectedGenre === "any" && /фэнтези|fantasy|маги|magic|дракон|dragon|меч|sword|маг|wizard|рыцарь|knight|средневеков|паладин|гоблин|эльф|гном|заклинани/i.test(systemPrompt));

  if (isFantasyWorld) {
    if (isRuGm) {
      parts.push(`<setting_rule>\nДействие происходит СТРОГО в ФЭНТЕЗИ-МИРЕ (Средневековье / Магия). Используй только фэнтезийные термины, избегай современных предметов.\n</setting_rule>`);
    } else {
      parts.push(`<setting_rule>\nThe story takes place STRICTLY in a FANTASY WORLD (Medieval / Magic). Use only fantasy terms, avoid modern items.\n</setting_rule>`);
    }
  }

  if (activePersona) {
    const userContextLines = [];
    userContextLines.push(isRuGm ? `Имя: ${activePersona.userName}` : `Name: ${activePersona.userName}`);
    userContextLines.push(isRuGm ? `Местоимения: ${activePersona.userPronouns}` : `Pronouns: ${activePersona.userPronouns}`);
    if (activePersona.description && activePersona.description.trim()) {
      userContextLines.push(isRuGm ? `Описание/Предыстория: ${activePersona.description.trim()}` : `Description/Backstory: ${activePersona.description.trim()}`);
    }
    parts.push(`<user_info>\n${userContextLines.join("\n")}\n</user_info>`);
  }

  const allPinned = loadPinnedFacts();
  const pinnedList = allPinned[activeChatId] || [];
  if (pinnedList.length > 0) {
    const formatted = pinnedList.map(f => `- ${f}`).join("\n");
    parts.push(`<pinned_memory_facts>\n${formatted}\n</pinned_memory_facts>`);
  }

  // --- Dynamic Tail (Directives, Lorebooks, Memory, RAG) ---
  const directivesMap = state.characterDirectives || {};
  const activeDirectives = (directivesMap[activeChatId] || []).filter(d => d.active !== false && d.text && d.text.trim());
  if (activeDirectives.length > 0) {
    const hardDirectives = activeDirectives.filter(d => d.priority === "hard");
    const normalDirectives = activeDirectives.filter(d => d.priority !== "hard");

    if (hardDirectives.length > 0) {
      const hardList = hardDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRuGm) {
        parts.push(`<hard_priority_directives>\n🚨 КРИТИЧЕСКИЙ ПРИОРИТЕТ — ОБЯЗАТЕЛЬНЫЕ СЮЖЕТНЫЕ УСТАНОВКИ ДЛЯ СЦЕНЫ:\n${hardList}\n</hard_priority_directives>`);
      } else {
        parts.push(`<hard_priority_directives>\n🚨 CRITICAL HARD PRIORITY DIRECTIVES FOR SCENE:\n${hardList}\n</hard_priority_directives>`);
      }
    }

    if (normalDirectives.length > 0) {
      const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRuGm) {
        parts.push(`<core_directives>\n${normalList}\n</core_directives>`);
      } else {
        parts.push(`<core_directives>\n${normalList}\n</core_directives>`);
      }
    }
  }

  // Participant Lorebooks
  const activeLoreList = [];
  const scene = isGm ? state.gmScenes.find(s => s.id === activeId) : null;
  const participants = isGm
    ? (scene?.participants || [])
    : (state.activeGroupCharacterIds || []).map(id => state.characters.find(c => c.id === id)).filter(Boolean);
  
  participants.forEach(npc => {
    const lContent = scanLoreBookAndBuildContent(npc, userInput, activeChatId);
    if (lContent && lContent.trim()) {
      activeLoreList.push(replaceMacros(lContent.trim(), npc));
    }
  });

  if (activeLoreList.length > 0) {
    parts.push(`<character_lorebook>\n${activeLoreList.join("\n\n")}\n</character_lorebook>`);
  }

  const chatMeta = state.chatMetadata?.[activeChatId] || {};
  const worldLore = chatMeta.worldLore;
  const gmSessionMemory = getSessionMemory(activeChatId);
  const { loreBlock, includedNames } = buildWorldLoreCompendium(worldLore, activeChatId, userInput, gmSessionMemory);
  if (loreBlock) {
    parts.push(loreBlock);
  }

  const gmChat = state.chats[activeChatId] || [];
  const gmChatTotalCount = getChatTotalMessageCount(gmChat);
  const memSummaryBlocks = buildMemoryAndSummaryBlocks(activeChatId, gmChatTotalCount, isRuGm, {
    activeCharacterName: null,
    isDuo: false,
  });
  if (memSummaryBlocks.length > 0) {
    parts.push(...memSummaryBlocks);
  }

  const recentChat = state.chats[activeChatId] || [];
  const enrichedQuery = `${recentChat.slice(-4).map(m => m.content).join(" ")} ${userInput}`;
  const ragMemories = Array.isArray(customRagMemories)
    ? customRagMemories
    : retrieveRelevantMemories(activeChatId, enrichedQuery, 5);
  const formattedRag = formatRetrievedMemories(ragMemories, includedNames);
  if (formattedRag) {
    parts.push(formattedRag);
  }

  return parts.join("\n\n");
}

