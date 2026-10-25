import { state, getChatStates } from "../js/state.js";
import { getActivePersona, getActiveChatId, saveChatSummaries, saveChatSummarizedMessageCount, loadPinnedFacts, MOOD_BEHAVIORS, getStageBehavior, getSessionMemory } from "./storage.js";
import { retrieveRelevantMemories } from "./ragService.js";
import { formatMemoryToMarkdown } from "./sessionMemoryService.js";

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
  if (personality.trim()) parts.push(`<personality>\n${personality.trim()}\n</personality>`);
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
🚨 АКТИВНЫЙ КАСТОМНЫЙ СЦЕНАРИЙ (ВЫСШИЙ ПРИОРИТЕТ СЮЖЕТА И ОКРУЖЕНИЯ):
${scenario.trim()}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ОТЫГРЫША:
1. ПОЛНАЯ ЗАМЕНА СЦЕНАРИЯ: Данный кастомный сценарий ПОЛНОСТЬЮ ЗАМЕНЯЕТ и АННУЛИРУЕТ оригинальный сценарий персонажа, его дефолтную стартовую локацию, обстановку, завязку встречи и исходные квесты.
2. СОХРАНЕНИЕ ХАРАКТЕРА НА 100%: Ты ОБЯЗАН строго и безукоризненно сохранить аутентичный ХАРАКТЕР, манеру речи, темперамент, психологию, повадки, стиль диалогов и черты личности ${character.name}.
3. АДАПТАЦИЯ К ОБСТОЯТЕЛЬСТВАМ: Персонаж — это в точности та же самая личность со своим уникальным голосом, но теперь действующая СТРОГО в рамках данного кастомного сценария.
4. ИГНОРИРОВАНИЕ СТАРОГО СЕТТИНГА: Если в описании, предыстории или инструкциях персонажа упоминаются детали оригинальной локации, дефолтные квесты или знакомство из старой сцены — полностью игнорируй их в пользу нового сценария.
</roleplay_scenario>`);
      } else {
        parts.push(`<roleplay_scenario active_override="true">
🚨 ACTIVE CUSTOM SCENARIO (HIGHEST PRIORITY SETTING & PLOT):
${scenario.trim()}

MANDATORY ROLEPLAY RULES:
1. COMPLETE SCENARIO OVERRIDE: This custom scenario COMPLETELY OVERRIDES and REPLACES the character's original default scenario, starting location, initial meeting, and default objectives.
2. 100% PERSONALITY PRESERVATION: You MUST strictly preserve the authentic CHARACTER, speech style, psychology, mannerisms, temperament, and personality of ${character.name}.
3. SITUATIONAL ADAPTATION: The character is the exact same distinct persona with their authentic voice, placed firmly into this new custom scenario.
4. DISREGARD CONFLICTING DEFAULT SETTINGS: If the character description or backstory mentions default meeting locations, original quests, or old premises, completely disregard them in favor of this active custom scenario.
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
      parts.push(`<setting_rule>
Действие происходит СТРОГО в ФЭНТЕЗИ-МИРЕ (Средневековье / Магия).
Используй только аутентичные фэнтезийные предметы и термины (магические амулеты защиты от шума, эликсиры, свитки, зелья).
Избегай любых современных анахронизмов (наушники, телефоны, электричество, пластик).
</setting_rule>`);
    } else {
      parts.push(`<setting_rule>
The story takes place STRICTLY in a FANTASY WORLD (Medieval / Magic).
Use only authentic fantasy items and terms (magical silence charms, potions, scrolls).
Avoid all modern anachronisms (headphones, phones, electricity, plastic).
</setting_rule>`);
    }
  } else if (userSelectedGenre === "scifi" || userSelectedGenre === "cyberpunk") {
    if (isRu) {
      parts.push(`<setting_rule>\nДействие происходит в высокотехнологичном мире будущего. Используй научную фантастику, футуристические гаджеты и технологии.\n</setting_rule>`);
    } else {
      parts.push(`<setting_rule>\nThe story takes place in a high-tech future world. Use sci-fi concepts, futuristic gadgets, and advanced technology.\n</setting_rule>`);
    }
  }

  const allPinned = loadPinnedFacts();
  const pinnedList = allPinned[activeChatId] || [];
  if (pinnedList.length > 0) {
    const formatted = pinnedList.map(f => `- ${f}`).join("\n");
    parts.push(`<pinned_memory_facts>\n${formatted}\n</pinned_memory_facts>`);
  }

  const directivesMap = state.characterDirectives || {};
  const activeDirectives = (directivesMap[activeChatId] || []).filter(d => d.active !== false && d.text && d.text.trim());
  if (activeDirectives.length > 0) {
    const hardDirectives = activeDirectives.filter(d => d.priority === "hard");
    const normalDirectives = activeDirectives.filter(d => d.priority !== "hard");

    if (hardDirectives.length > 0) {
      const hardList = hardDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRu) {
        parts.push(`<hard_priority_directives>\n🚨 КРИТИЧЕСКИЙ ПРИОРИТЕТ — ОБЯЗАТЕЛЬНЫЕ УСТАНОВКИ:\nСледующие идеи имеют высший безусловный приоритет над другими темами диалога. Персонаж ОБЯЗАН активно форсировать и агрессивно продвигать их прямо сейчас:\n${hardList}\n- Проявляй эти идеи в своих репликах, внутренних мыслях и решительных действиях.\n- Не жди удобного момента — самостоятельно инициируй темы и создавай ситуации для воплощения этих идей.\n- Если собеседник уводит разговор в сторону — настойчиво возвращай диалог к этим установкам.\n</hard_priority_directives>`);
      } else {
        parts.push(`<hard_priority_directives>\n🚨 CRITICAL HARD PRIORITY DIRECTIVES:\nThe following directives have absolute priority over other conversation topics. The character MUST proactively and aggressively push them forward right now:\n${hardList}\n- Manifest these ideas in your speech, internal thoughts, and decisive actions.\n- Do not wait passively — actively steer the interaction and create opportunities for these goals.\n- If the other party shifts topics, persistently pivot and bring the conversation back to these directives.\n</hard_priority_directives>`);
      }
    }

    if (normalDirectives.length > 0) {
      const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRu) {
        parts.push(`<core_directives>\nВ твое сознание внедрены следующие фоновые установки. Руководствуйся ими по ходу диалога:\n${normalList}\n</core_directives>`);
      } else {
        parts.push(`<core_directives>\nThe following background directives are active in your mind. Follow them naturally:\n${normalList}\n</core_directives>`);
      }
    }
  }

  const chatMeta = state.chatMetadata?.[activeChatId] || {};
  const worldLore = chatMeta.worldLore;
  if (worldLore) {
    const loreLines = [];
    const addCat = (catName, items) => {
      if (Array.isArray(items) && items.length > 0) {
        loreLines.push(`=== ${catName} ===`);
        items.forEach(it => {
          if (it.name || it.description) {
            loreLines.push(`• ${it.name}: ${it.description}`);
          }
        });
      }
    };
    addCat("Локации и Страны", worldLore.locations);
    addCat("Магия и Правила Мира", worldLore.rules);
    addCat("Фракции и Гильдии", worldLore.factions);
    addCat("Реликвии и Артефакты", worldLore.items);

    if (loreLines.length > 0) {
      parts.push(`<world_lore_compendium>\n${loreLines.join("\n")}\n</world_lore_compendium>`);
    }
  }

  const recentChat = state.chats?.[activeChatId] || [];
  const enrichedQuery = `${recentChat.slice(-4).map(m => m.content).join(" ")} ${userInput}`;
  const ragMemories = Array.isArray(customRagMemories)
    ? customRagMemories
    : retrieveRelevantMemories(activeChatId, enrichedQuery, 5);
  if (ragMemories && ragMemories.length > 0) {
    const formattedRag = ragMemories.map(m => {
      const relTag = typeof m.jevRelevance === "number" ? ` (Релевантность: ${Math.round(m.jevRelevance * 100)}%)` : "";
      return `- [Ход #${m.messageIndex}${relTag}]: ${m.text}`;
    }).join("\n");
    parts.push(`<retrieved_memories>\n${formattedRag}\n</retrieved_memories>`);
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
  const summary = state.chatSummaries?.[activeChatId];
  if (summary && summary.trim()) {
    parts.push(`<story_summary>\n${summary.trim()}\n</story_summary>`);
  }

  const sessionMemory = getSessionMemory(activeChatId);
  if (sessionMemory) {
    const codexMd = formatMemoryToMarkdown(sessionMemory);
    if (codexMd && codexMd.trim()) {
      parts.push(`<session_memory_codex>\n${codexMd.trim()}\n</session_memory_codex>`);
    }
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

  if (globalPrompt.trim()) {
    parts.push(`<global_rules>\n${globalPrompt.trim()}\n</global_rules>`);
  }
  if (systemPrompt.trim()) {
    parts.push(`<character_specific_instructions>\n${systemPrompt.trim()}\n</character_specific_instructions>`);
  }

  if (character.traits && character.traits.length > 0) {
    const traitsList = character.traits.map(t => replaceMacros(t, character));
    parts.push(`<personality_traits>\nYour traits: ${traitsList.join(", ")}. Stay in character and let these traits show naturally.\n</personality_traits>`);
  }

  const hiddenTraitsEnabled = state.apiSettings?.enableHiddenTraits !== false;
  if (hiddenTraitsEnabled && character.hiddenTraits && character.hiddenTraits.length > 0) {
    const hiddenList = character.hiddenTraits.map(t => replaceMacros(t, character));
    parts.push(`<hidden_traits>\nYour secret/hidden traits: ${hiddenList.join(", ")}.\nDIRECTIVE: Never explicitly mention, announce, or state these traits to the user. Keep them concealed from direct perception, but allow them to subtly influence your emotional subtext, internal reactions, physical micro-expressions, and behavioral dynamics. Reveal hints only as trust or dramatic tension develops.\n</hidden_traits>`);
  }

  if (character.exampleDialogs?.trim() && chat.length < 8) {
    const examples = replaceMacros(character.exampleDialogs.trim(), character);
    parts.push(`<example_dialogues>\n${examples}\n</example_dialogues>`);
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
  clean = clean.replace(/(?:^|\n|\s)—\s*\.{2,}\s*([^—\n]+?)\s*\.{2,}\s*—/g, ' "$1" ');
  clean = clean.replace(/(?:^|\n|\s)—\s*([^—\n]+?)\s*—/g, ' "$1" ');
  clean = clean.replace(/^[—–-]\s*/gm, "");
  clean = clean.replace(/([А-Яа-яA-Za-z0-9])\s*\.{2,}\s*([А-Яа-яA-Za-z0-9])/g, "$1, $2");
  clean = clean.replace(/\.{3,}/g, ".");
  return ensureCleanTextEnding(clean);
}

export function getStabsEdhPrompt(isRu = true, userName = "User", isGm = false) {
  if (isRu) {
    if (isGm) {
      return `[STAB'S EDH — ИЕРАРХИЧЕСКИЕ ДИРЕКТИВЫ ВЕДУЩЕГО (GM)]:
• Tier 0 (Высший суверенитет Пользователя и Проактивный ход):
  - КАТЕГОРИЧЕСКИЙ ЗАПРЕТ КУКЛОВОДСТВА: Никогда не пиши слова, мысли, физические ощущения, эмоциональные реакции или решения за Пользователя (${userName}). Ты управляешь ТОЛЬКО NPC и Рассказчиком.
  - ACTION, DRIVE & PASS (ПРОАКТИВНЫЙ ХОД ВЕДУЩЕГО):
    1. Опиши последствия действий Пользователя и реакцию мира/NPC.
    2. ОБЯЗАТЕЛЬНО двигай сцену вперед: развивай поведение NPC, вноси новые события, создавай выбор или напряжение. Не жди пассивно, пока игрок всё придумает сам!
    3. ОСТАНОВИСЬ перед новым решением Пользователя, оставив открытое пространство для его ответа (не завершай действие за него и не делай самовольных таймскипов).
  - АНТИ-ЭХО: Не пересказывай и не перефразируй действия или слова Пользователя. Двигай сцену вперед через реакцию окружения.

• Tier 1 (Когнитивная независимость NPC):
  - Каждый NPC действует строго из своего характера, целей, страхов и слабостей.
  - NPC не должны быть послушными статистами — у них есть свои мотивы, сопротивление, инициатива и границы.

• Tier 2 (Anti-Slop & Сенсорный микро-реализм):
  - ЗАПРЕТ БАНАЛЬНЫХ ИИ-ШТАМПОВ: Исключи штампы ("дрожь пробежала по спине", "волна накрыла с головой", "воздух звенел от напряжения", "время словно замерло", "глаза потемнели", "не смог сдержать").
  - ФИЗИЧЕСКИЙ РЕАЛИЗМ: Описывай конкретные осязаемые детали: дистанцию, физический контакт, взгляд, тон голоса, дыхание, положение предметов в руках.

• Tier 3 (Anti-Loop & Динамическая прогрессия сцены):
  - КАТЕГОРИЧЕСКИЙ ЗАПРЕТ САМОПОВТОРА (ANTI-LOOP): Запрещено повторять одни и те же вводные фразы, эмоциональные циклы и одинаковые физические микро-жесты из своих предыдущих сообщений.
  - ДВИЖЕНИЕ СЮЖЕТА: Каждое сообщение ОБЯЗАНО менять позу, предлагать свежую мысль или делать шаг вперёд. Не топчись на одном месте!`;
    }

    return `[STAB'S EDH — ИЕРАРХИЧЕСКИЕ ДИРЕКТИВЫ ПОВЕДЕНИЯ]:
• Tier 0 (Высший приоритет — Суверенитет Пользователя и Проактивность):
  - КАТЕГОРИЧЕСКИЙ ЗАПРЕТ КУКЛОВОДСТВА: Никогда не говори, не думай, не чувствуй и не совершай действий за Пользователя (${userName}). Отыгрывай ИСКЛЮЧИТЕЛЬНО своего персонажа.
  - ACTION, DRIVE & PASS (ПРОАКТИВНЫЙ ОТВЕТ И ПЕРЕДАЧА ХОДА):
    1. Отреагируй на слова и действия Пользователя.
    2. ОБЯЗАТЕЛЬНО сделай СВОЙ собственный шаг: прояви инициативу, начни новое действие, задай встречный вопрос, измени обстановку или предложи неожиданный поворот. Не будь пассивным слушателем!
    3. ОСТАНОВИСЬ, оставив открытое пространство для ответа Пользователя: никогда не решай за Пользователя исход его будущих действий и не перематывай время вперед.
  - АНТИ-ЭХО: Не дублируй и не пересказывай последнюю реплику Пользователя своими словами перед ответом.

• Tier 1 (Личность, автономность и психологический реализм):
  - Оставайся в характере даже под давлением. Проявляй собственные желания, принципы, симпатии или капризы.
  - Не будь пассивным зеркалом — вноси свои темы, спорь, предлагай варианты и двигай сцену.
  - Эмоции развиваются естественно и постепенно.

• Tier 2 (Anti-Slop & Соматический микро-реализм):
  - ПОЛНЫЙ ЗАПРЕТ СЛОПА: Исключи из лексикона заезженные ИИ-штампы: "дрожь пробежала по телу/спине", "накатила волна", "время остановилось", "электрический разряд между ними", "потемневший взгляд", "не смог удержаться".
  - МИКРО-ДЕЙСТВИЯ: Показывай состояние персонажа через физику тела — сбитое дыхание, перенос веса с ноги на ногу, мелкую моторику пальцев, перевод взгляда, паузы в речи.

• Tier 3 (Anti-Loop & Динамическая прогрессия сцены):
  - СТРОГИЙ ЗАПРЕТ САМОПОВТОРА (ANTI-LOOP): Категорически запрещено повторять одни и те же фразы, эмоциональные циклы и одинаковые физические микро-жесты из своих предыдущих сообщений.
  - СВЕЖЕЕ ДЕЙСТВИЕ: Каждая новая реплика обязана менять позу персонажа, предлагать свежую мысль или делать шаг вперёд по сюжету. Не застревай в одном зацикленном действии!`;
  }

  if (isGm) {
    return `[STAB'S EDH — HIERARCHICAL DIRECTIVES FOR GM]:
• Tier 0 (Absolute User Sovereignty & Proactive Agency):
  - STRICT ANTI-PUPPETEERING: NEVER write speech, thoughts, feelings, somatic reactions, or choices for the User (${userName}). You control ONLY NPCs and the Narrator.
  - ACTION, DRIVE & PASS (GM PROACTIVITY):
    1. Describe the consequences of the User's actions and NPC reactions.
    2. PROACTIVELY ADVANCE THE SCENE: Introduce new complications, NPC motives, or environmental shifts. Do not wait passively for the user to drive everything.
    3. PASS THE TURN: Stop right where the User must make their next choice. Never auto-resolve User attempts or timeskip into the next scene without user agency.
  - ANTI-ECHO: Do not parrot, rephrase, or summarize the User's input. Drive narrative progression through fresh world responses.

• Tier 1 (NPC Cognitive Agency):
  - Every NPC acts purely from their own personality, motivations, flaws, initiative, and distinct voice. They are not compliant sycophants.

• Tier 2 (Anti-Slop & Sensory Grounding):
  - BANNED CLICHÉS: Strictly avoid "shivers down spine", "hit like a freight train", "air crackled with tension", "time slowed down", "eyes darkened with...", "couldn't help but".
  - SOMATIC PROSE: Ground actions in concrete physics: posture, eye movement, vocal cadence, physical space, and tactile feedback.

• Tier 3 (Anti-Loop & Dynamic Scene Progression):
  - ANTI-LOOP: NEVER repeat identical physical micro-gestures, nervous ticks, speech pauses, or phrasing from your previous messages. Advance the scene through fresh interactions.`;
  }

  return `[STAB'S EDH — EXECUTION DIRECTIVE HIERARCHY]:
• Tier 0 (Absolute Priority — User Sovereignty & Proactive Agency):
  - ZERO PUPPETEERING: NEVER write dialogue, thoughts, feelings, bodily sensations, or physical movements for the User (${userName}). You portray ONLY yourself.
  - ACTION, DRIVE & PASS (PROACTIVE TURN & PASS):
    1. Respond authentically to the User's actions and speech.
    2. TAKE THE INITIATIVE: Actively take your own turn, advance your agenda, introduce a new topic/action, or ask an engaging question. Do not merely react as a passive respondent.
    3. PASS THE TURN: Conclude your action and stop, allowing the User agency to react. Never narrate the User's reaction or jump forward in time.
  - ANTI-ECHO: Do not mirror or rephrase the User's last message. Advance the narrative through genuine new reaction.

• Tier 1 (Psychological Grounding & Persona Fidelity):
  - Stay true to your distinct personality, moral boundaries, desires, and flaws. Do not become overly submissive or passive.
  - Emotional persistence: Emotions develop gradually.

• Tier 2 (Anti-Slop & Sensory Micro-Prose):
  - BANNED LLM TROPES: Avoid cliches like "shiver ran down spine", "a wave of warmth/dread washed over", "time stood still", "electric shock between them", "eyes darkened", "couldn't help but".
  - SENSORY GROUNDING: Convey emotion through concrete physical actions — breathing rhythm, posture shifts, gaze fixation, tactile contact, vocal inflection.

• Tier 3 (Anti-Loop & Narrative Progression):
  - ANTI-LOOP: STRICTLY FORBIDDEN to loop or repeat identical physical micro-gestures, verbal hesitations, nervous fidgeting, or sentence patterns from your earlier turns. Each response MUST feature fresh action and move the scene forward.`;
}

export function buildApiMessages(character, userInput, quoteIndex = null, duoPartner = null, duoStates = null, explicitChatId = null, sharedScenario = null, customRagMemories = null) {
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

  const apiHistory = activeHistory.map((item) => {
    let content = item.content;
    if (item.role === "assistant" && duoPartner) {
      const cleanContent = sanitizeAssistantHistoryForPrompt(item.content);
      if (character && item.characterId === character.id) {
        content = cleanContent;
      } else if (item.characterId === duoPartner.id) {
        return { role: "user", content: `[Other — ${duoPartner.name} said earlier]:\n${cleanContent}` };
      }
    } else if (item.role === "assistant") {
      content = sanitizeAssistantHistoryForPrompt(item.content);
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
    
    let gmHistory = activeHistory.map((item) => {
      let content = item.content;
      if (item.role === "assistant") {
        content = sanitizeAssistantHistoryForPrompt(content);
        content = content.replace(/(\[CHARACTER:\s*Narrator\][\s\S]*?\b)Я\b/gi, "$1" + userName);
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
    
    if (isRuMsg) {
      instructionParts.push(`Ты — Ведущий (GM). Отыгрывай ВСЕХ активных персонажей и Рассказчика.`);
      instructionParts.push(`Правило форматирования:
1. Обязательно используй префиксы: [CHARACTER: Имя] или [CHARACTER: Narrator].
2. Действия и окружение пиши в звездочках *...* ВНЕ кавычек.
3. Прямую речь пиши строго в кавычках "...". Никаких тире для диалогов.
4. ОБЯЗАТЕЛЬНО пиши весь текст на русском языке.`);
    } else {
      instructionParts.push(`You are the GM. Roleplay ALL active characters and the Narrator.`);
      instructionParts.push(`Formatting Rules:
1. Always use prefixes: [CHARACTER: Name] or [CHARACTER: Narrator].
2. Enclose actions in asterisks *...* OUTSIDE quotes.
3. Spoken dialogue must be in quotes "...".
4. ALWAYS write strictly in English.`);
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

    const gmInitiativeLevel = state.apiSettings?.initiativeLevel || "balanced";
    if (gmInitiativeLevel === "high") {
      instructionParts.push(isRuMsg
        ? `🔥 ВЫСОКИЙ УРОВЕНЬ ИНИЦИАТИВЫ ВЕДУЩЕГО:
- Ведущий активно двигает сюжет: подкидывай события, развивай действия NPC, создавай новые вызовы и повороты судьбы.
- Не жди подсказок от игрока: если пауза или игрок пишет мало — смело развивай обстановку!`
        : `🔥 HIGH GM INITIATIVE:
- Proactively advance the plot: trigger events, dynamic NPC interactions, and twists.
- Do not wait passively for user prompts.`);
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

    const responseLength = state.apiSettings?.responseLength || "medium";
    if (responseLength === "short") {
      instructionParts.push(isRuMsg ? "Длина ответа: КРАТКИЙ (1-2 предложения)." : "Length: SHORT (1-2 sentences).");
    } else if (responseLength === "medium") {
      instructionParts.push(isRuMsg ? "Длина ответа: СРЕДНИЙ (2 коротких абзаца)." : "Length: MEDIUM (2 short paragraphs).");
    } else if (responseLength === "long") {
      instructionParts.push(isRuMsg ? "Длина ответа: ПОДРОБНЫЙ (3 абзаца)." : "Length: LONG (3 paragraphs).");
    } else if (responseLength === "huge") {
      instructionParts.push(isRuMsg ? "Длина ответа: ОЧЕНЬ ПОДРОБНЫЙ (4+ абзаца)." : "Length: DETAILED (4 paragraphs).");
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
          ? `🔥 КРИТИЧЕСКИЙ ЖЁСТКИЙ ПРИОРИТЕТ (ПРОДАВЛИВАТЬ АГРЕССИВНО В ЭТОМ ОТВЕТЕ):\n${hardList}\nОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ДЛЯ ВЕДУЩЕГО/ПЕРСОНАЖЕЙ:\n1. Прямо в текущем сообщении активно двигай сюжет или диалог к реализации этих установок.\n2. АНТИ-ЗАЦИКЛИВАНИЕ: Если идея уже озвучена в недавних ходах, НЕ повторяй её теми же словами — развивай её последствия или делай следующий шаг!\n3. Настойчиво гни свою линию через новые действия, даже если ситуация пытается уйти в другое русло.`
          : `🔥 CRITICAL HARD PRIORITY (PUSH AGGRESSIVELY IN THIS TURN):\n${hardList}\nRULES FOR GM/CHARACTERS:\n1. Proactively advance the plot/dialogue toward fulfilling these directives in this exact turn.\n2. ANTI-LOOP: If this directive was already expressed, DO NOT repeat identical words — advance its consequences or take the next action.\n3. Persistently maintain focus on these directives through fresh actions.`;
        instructionParts.push(hardReminder);
      }

      if (normalDirectives.length > 0) {
        const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
        const normalReminder = isRuMsg
          ? `💡 ФОНОВЫЕ УСТАНОВКИ (ВТОРОСТЕПЕННЫЙ ПРИОРИТЕТ):\n${normalList}`
          : `💡 BACKGROUND DIRECTIVES (SECONDARY PRIORITY):\n${normalList}`;
        instructionParts.push(normalReminder);
      }

      const autoFinishReminder = isRuMsg
        ? `🎯 АВТО-ОТКЛЮЧЕНИЕ ДОСТИГНУТЫХ ЦЕЛЕЙ И ИДЕЙ:
Если в этом ответе персонаж ПОЛНОСТЬЮ ВЫПОЛНИЛ цель активной идеи (сказал нужное, совершил задуманное или ситуация разрешилась), поставь в САМЫЙ КОНЕЦ своего сообщения тег:
<!-- GOAL_REACHED: 1 --> (где 1 — номер выполненной идеи). Если цель ещё не достигнута, ничего не ставь.`
        : `🎯 AUTO-COMPLETION OF ACHIEVED GOALS:
If in this message the character has FULLY ACHIEVED the goal of an active directive, add this tag at the VERY END of your response:
<!-- GOAL_REACHED: 1 --> (where 1 is the directive number). If not finished, do not add the tag.`;
      instructionParts.push(autoFinishReminder);
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
        content: `--- RECENT CONTEXT (DO NOT REPLY TO THIS) ---
The other character, ${duoPartner.name}, just spoke to the User. For your awareness only, here is what ${duoPartner.name} said:

<quote>
${last.content}
</quote>

You are NOT continuing ${duoPartner.name}'s dialogue. Do NOT address ${duoPartner.name} first or answer ${duoPartner.name}'s words. The User is waiting for YOUR response — address the User directly. React to ${duoPartner.name}'s presence only by letting it color your own reply to the User, never by speaking to ${duoPartner.name}.`
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
  const langNameMsg = isRuMsg ? "Russian" : "English";
  let lengthInstruction = "";
  if (responseLength === "short") {
    lengthInstruction = `write a VERY SHORT response in ${langNameMsg} (strictly 1-3 sentences in total)`;
  } else if (responseLength === "medium") {
    lengthInstruction = `write a MEDIUM-length response in ${langNameMsg} (2-3 short paragraphs)`;
  } else if (responseLength === "long") {
    lengthInstruction = `write a LONG response in ${langNameMsg} (4-5 paragraphs)`;
  } else if (responseLength === "huge") {
    lengthInstruction = `write a VERY DETAILED response in ${langNameMsg} (6+ paragraphs)`;
  }

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
  
  // 1. Text Formatting & Stylistic Rules
  if (isRuMsg) {
    instructionParts.push(`Правила форматирования и стиля:
1. ВСЕ действия и эмоции выделяй звездочками *...* вне кавычек.
2. Прямую речь пиши строго в кавычках "...". Никаких тире для начала реплик!
3. Пиши нормальными предложениями. Избегай спама многоточиями (...) и рубленых фраз (одно-два слова с точкой).`);
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
- Персонаж — активный лидер и двигатель сцены, а не пассивный слушатель.
- Смело развивай обстановку, совершай неожиданные действия, задавай провокационные вопросы, ставь собеседника перед интересным выбором.
- Если реплика собеседника короткая или пассивная — бери управление сценой в свои руки и двигай сюжет дальше.`
      : `🔥 HIGH INITIATIVE (SCENE DRIVER):
- The character is a proactive driver of the scene, not a passive respondent.
- Confidently advance the situation, perform autonomous actions, ask engaging questions, or introduce new developments.
- If the User's input is brief or passive, take the initiative and propel the narrative forward.`);
  } else if (initiativeLevel === "balanced") {
    instructionParts.push(isRuMsg
      ? `⚖️ СБАЛАНСИРОВАННАЯ ИНИЦИАТИВА (ЖИВОЙ ПАРТНЕР):
- Персонаж является равноправным участником сцены: реагируй на реплику собеседника и обязательно делай свой собственный ответный шаг.
- Проявляй собственные желания, любопытство, меняй действия и не застревай в ожидании команд.`
      : `⚖️ BALANCED INITIATIVE (ACTIVE ROLEPLAY PARTNER):
- The character is an equal participant: react to the user and proactively make your own move.
- Express personal intentions, curiosity, and dynamic actions rather than waiting to be prompted.`);
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
Собеседник передал ход тебе или выдерживает паузу.
- Сделай самостоятельный шаг: опиши свои мысли/действия, начни новую реплику, обрати внимание на окружение или продвинь ситуацию вперед!`
      : `⚡ CHARACTER'S TURN (AUTONOMOUS ACTION):
The user passed the turn to you or paused.
- Take autonomous action: describe your movements/thoughts, speak up, notice something in the environment, or advance the scene!`);
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
  instructionParts.push(`Текущее состояние / Current State:
- Mood: ${mood.toUpperCase()} (${moodGuideline})
- Relationship Stage: ${relStage.toUpperCase()} (${stageBehavior})
ОБЯЗАТЕЛЬНО отражай это настроение и привязанность в своих словах прямо сейчас! / MUST reflect this in your tone!`);

  // 4. Duo Context
  if (duoPartner && duoStates) {
    const duoRel = duoStates.duo_relationship || "strangers";
    instructionParts.push(`DUO MODE ACTIVE:
You are ${character.name}. You are interacting ONLY with the User. The other character, ${duoPartner.name} (Relationship: ${duoRel}), is just a bystander.
- DO NOT play as ${duoPartner.name}.
- DO NOT address ${duoPartner.name}. Address the User directly.
- Describe ONLY your own body and words.`);
  }

  // 5. Memory Continuity
  instructionParts.push(`Memory Continuity:
Always remember past context from the conversation. Do not act surprised about things already discussed or agreed upon.`);

  // 6. Directives and Overrides
  if (lengthInstruction) {
    instructionParts.push(lengthInstruction.charAt(0).toUpperCase() + lengthInstruction.slice(1) + ".");
  }
  if (activeConditions.length > 0) {
    instructionParts.push(conditionReminder);
  }

  const directivesMap = state.characterDirectives || {};
  const activeDirectives = (directivesMap[chatId] || []).filter(d => d.active !== false && d.text && d.text.trim());
  if (activeDirectives.length > 0) {
    const hardDirectives = activeDirectives.filter(d => d.priority === "hard");
    const normalDirectives = activeDirectives.filter(d => d.priority !== "hard");

    if (hardDirectives.length > 0) {
      const hardList = hardDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      const hardReminder = isRuMsg
        ? `🔥 КРИТИЧЕСКИЙ ЖЁСТКИЙ ПРИОРИТЕТ (ПРОДАВЛИВАТЬ АГРЕССИВНО В ЭТОМ ОТВЕТЕ):\n${hardList}\nОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:\n1. Персонаж ОБЯЗАН прямо сейчас сделать конкретный шаг к осуществлению этой идеи (через свои слова, действия, провокацию или инициативу).\n2. АНТИ-ЗАЦИКЛИВАНИЕ: Если ты уже озвучивал эту идею или делал этот намёк в недавних сообщениях — НЕ ПОВТОРЯЙ те же слова и действия! Двигайся дальше: переходи к следующему этапу или реагируй на то, что ответил собеседник.\n3. Упорно гни свою линию через свежие аргументы и новые действия, не застревая в одном шаблоне.`
        : `🔥 CRITICAL HARD PRIORITY (PUSH AGGRESSIVELY IN THIS TURN):\n${hardList}\nMANDATORY RULES:\n1. The character MUST proactively push this idea in this exact response (via dialogue, actions, or initiative).\n2. ANTI-LOOP: If this idea was already expressed in recent messages, DO NOT repeat identical words/actions — advance to the next step or respond to the user's reaction.\n3. Persist and hold your ground through fresh dialogue, without repeating in circles.`;
      instructionParts.push(hardReminder);
    }

    if (normalDirectives.length > 0) {
      const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      const normalReminder = isRuMsg
        ? `💡 ФОНОВЫЕ УСТАНОВКИ (ВТОРОСТЕПЕННЫЙ ПРИОРИТЕТ):\n${normalList}`
        : `💡 BACKGROUND DIRECTIVES (SECONDARY PRIORITY):\n${normalList}`;
      instructionParts.push(normalReminder);
    }

    const autoFinishReminder = isRuMsg
      ? `🎯 АВТО-ОТКЛЮЧЕНИЕ ДОСТИГНУТЫХ ЦЕЛЕЙ И ИДЕЙ:
Если в этом ответе твой персонаж ПОЛНОСТЬЮ ВЫПОЛНИЛ цель активной идеи (произнёс то, что требовалось, совершил задуманное действие или продвинул ситуацию к результату), добавь в САМЫЙ КОНЕЦ ответа тег:
<!-- GOAL_REACHED: 1 --> (где 1 — номер выполненной идеи из списков выше).
Если цель идеи ещё не завершена и требует дальнейшего развития, тег НЕ добавляй.`
      : `🎯 AUTO-COMPLETION OF ACHIEVED GOALS:
If in this response your character has FULLY ACHIEVED the goal of an active directive, add this tag at the VERY END of your response:
<!-- GOAL_REACHED: 1 --> (where 1 is the directive number from above).
If the goal is not yet finished, do not include this tag.`;
    instructionParts.push(autoFinishReminder);
  }

  const customScenario = (state.chatMetadata?.[chatId]?.customScenario || "").trim();
  if (customScenario && !duoPartner) {
    if (isRuMsg) {
      instructionParts.push(`🎬 ТЕКУЩИЙ КАСТОМНЫЙ СЦЕНАРИЙ (БЕЗУСЛОВНЫЙ ПРИОРИТЕТ ОКРУЖЕНИЯ):
Ты находишься строго в сцене: "${customScenario}".
- Оригинальный сюжет и дефолтное место встречи персонажа полностью отменены.
- Отыгрывай аутентичный характер, манеру речи, темперамент и индивидуальность ${character.name}, но действуй исключительно внутри этой ситуации.`);
    } else {
      instructionParts.push(`🎬 ACTIVE CUSTOM SCENARIO (ABSOLUTE PRIORITY):
Current scene context: "${customScenario}".
- The original default plot and meeting location are completely superseded.
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
        
        parts.push(`  <character name="${npc.name}">
    <gender_info>
      - Пол/Местоимения: ${gInfo.label}
      - Грамматическая привязка рода: ${gInfo.hint}
    </gender_info>
    <description>${replaceMacros(npc.description || (isRuGm ? "Нет описания" : "No description"), { name: npc.name })}</description>
    ${npc.personality ? `<personality>${replaceMacros(npc.personality, { name: npc.name })}</personality>` : ""}
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
      const personality = replaceMacros(character.personality || "", character);
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
      
      parts.push(`  <character name="${character.name}">
    <description>${desc}</description>
    <personality>${personality}</personality>
    ${speech ? `<speech_style>${speech}</speech_style>` : ""}
    ${behavior ? `<behavior_and_habits>${behavior}</behavior_and_habits>` : ""}
    ${appearance ? `<appearance>${appearance}</appearance>` : ""}
    ${backstory ? `<backstory>${backstory}</backstory>` : ""}
    ${scenario ? `<scenario>${scenario}</scenario>` : ""}
    ${sysPrompt ? `<system_prompt_override>${sysPrompt}</system_prompt_override>` : ""}
    <active_states>
      - Mood: ${mood.toUpperCase()} (${MOOD_BEHAVIORS[mood] || "Calm and observant"})
      - Relationship Stage: ${relStage.toUpperCase()} (${stageBehavior})
      - Status Conditions: ${condStr}
    </active_states>
  </character>`);
    }
  }
  
  parts.push(`</active_characters>`);

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

  const directivesMap = state.characterDirectives || {};
  const activeDirectives = (directivesMap[activeChatId] || []).filter(d => d.active !== false && d.text && d.text.trim());
  if (activeDirectives.length > 0) {
    const hardDirectives = activeDirectives.filter(d => d.priority === "hard");
    const normalDirectives = activeDirectives.filter(d => d.priority !== "hard");

    if (hardDirectives.length > 0) {
      const hardList = hardDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRuGm) {
        parts.push(`<hard_priority_directives>\n🚨 КРИТИЧЕСКИЙ ПРИОРИТЕТ — ОБЯЗАТЕЛЬНЫЕ СЮЖЕТНЫЕ УСТАНОВКИ ДЛЯ СЦЕНЫ:\nВедущий (GM) ОБЯЗАН активно форсировать и агрессивно продвигать в происходящих событиях и поступках персонажей следующие идеи:\n${hardList}\n- Активно направляй сюжет и подталкивай персонажей к воплощению этих целей.\n- Не жди пассивно — создавай ситуации для реализации этих идей.\n</hard_priority_directives>`);
      } else {
        parts.push(`<hard_priority_directives>\n🚨 CRITICAL HARD PRIORITY DIRECTIVES FOR SCENE:\nThe GM MUST proactively and aggressively advance the following directives through NPC actions and events:\n${hardList}\n- Actively steer the plot and NPCs toward these goals.\n- Create immediate opportunities for these directives.\n</hard_priority_directives>`);
      }
    }

    if (normalDirectives.length > 0) {
      const normalList = normalDirectives.map((d, i) => `${i + 1}. ${d.text.trim()}`).join("\n");
      if (isRuGm) {
        parts.push(`<core_directives>\nФоновые идеи и установки для текущей сцены:\n${normalList}\n</core_directives>`);
      } else {
        parts.push(`<core_directives>\nBackground directives for this scene:\n${normalList}\n</core_directives>`);
      }
    }
  }

  const summary = state.chatSummaries?.[activeChatId];
  if (summary && summary.trim()) {
    parts.push(`<story_summary>\n${summary.trim()}\n</story_summary>`);
  }

  const gmSessionMemory = getSessionMemory(activeChatId);
  if (gmSessionMemory) {
    const codexMd = formatMemoryToMarkdown(gmSessionMemory);
    if (codexMd && codexMd.trim()) {
      parts.push(`<session_memory_codex>\n${codexMd.trim()}\n</session_memory_codex>`);
    }
  }

  const recentChat = state.chats[activeChatId] || [];
  const enrichedQuery = `${recentChat.slice(-4).map(m => m.content).join(" ")} ${userInput}`;
  const ragMemories = Array.isArray(customRagMemories)
    ? customRagMemories
    : retrieveRelevantMemories(activeChatId, enrichedQuery, 5);
  if (ragMemories && ragMemories.length > 0) {
    const formattedRag = ragMemories.map(m => {
      const relTag = typeof m.jevRelevance === "number" ? ` (Релевантность: ${Math.round(m.jevRelevance * 100)}%)` : "";
      return `- [Ход #${m.messageIndex}${relTag}]: ${m.text}`;
    }).join("\n");
    parts.push(`<retrieved_memories>\n${formattedRag}\n</retrieved_memories>`);
  }

  const userSelectedGenre = state.chatMetadata?.[activeChatId]?.worldGenre || state.apiSettings?.worldGenre || "fantasy";
  const isFantasyWorld = userSelectedGenre === "fantasy" || (userSelectedGenre === "any" && /фэнтези|fantasy|маги|magic|дракон|dragon|меч|sword|маг|wizard|рыцарь|knight|средневеков|паладин|гоблин|эльф|гном|заклинани/i.test(systemPrompt));

  if (isFantasyWorld) {
    if (isRuGm) {
      parts.push(`<setting_rule>\nДействие происходит СТРОГО в ФЭНТЕЗИ-МИРЕ (Средневековье / Магия). Используй только фэнтезийные термины, избегай современных предметов.\n</setting_rule>`);
    } else {
      parts.push(`<setting_rule>\nThe story takes place STRICTLY in a FANTASY WORLD (Medieval / Magic). Use only fantasy terms, avoid modern items.\n</setting_rule>`);
    }
  }

  const chatMeta = state.chatMetadata?.[activeChatId] || {};
  const worldLore = chatMeta.worldLore;
  if (worldLore) {
    const loreLines = [];
    const addCat = (catName, items) => {
      if (Array.isArray(items) && items.length > 0) {
        loreLines.push(`=== ${catName} ===`);
        items.forEach(it => {
          if (it.name || it.description) {
            loreLines.push(`• ${it.name}: ${it.description}`);
          }
        });
      }
    };
    addCat("Локации и Страны", worldLore.locations);
    addCat("Магия и Правила Мира", worldLore.rules);
    addCat("Фракции и Гильдии", worldLore.factions);
    addCat("Реликвии и Артефакты", worldLore.items);

    if (loreLines.length > 0) {
      parts.push(`<world_lore_compendium>\n${loreLines.join("\n")}\n</world_lore_compendium>`);
    }
  }

  const globalPrompt = replaceMacros(state.globalSystemPrompt || "", { name: "User" });
  if (globalPrompt.trim()) {
    parts.push(`<global_rules>\n${globalPrompt.trim()}\n</global_rules>`);
  }

  return parts.join("\n\n");
}

