import { defaultCharacters } from "./data/defaultCharacters.js";
import { curatedCharacters } from "./data/curatedCatalog.js";
import {
  searchChub,
  fetchChubCharacterDetails,
  convertChubToRawCard,
  parseChubUrl
} from "./services/chubService.js";
import {
  state,
  pushAction,
  undo,
  redo,
  getChatStates,
  onStateChange,
  onTraitModifier
} from "./js/state.js";
import {
  dom,
  setStatus,
  setApiStatus,
  showStateNotification,
  renderProgressBar,
  renderMoodIndicator,
  renderStates,
  renderStateProposals,
  renderEventLog,
  renderChatSelector,
  renderCharacters,
  renderMessages,
  renderMessagesThrottled,
  renderDebugLogs,
  renderWizardChat,
  renderPromptWizardChat,
  renderCoreStatesEditorList,
  renderLoreBookEditorList,
  createLoreBookEditorCard,
  selectAdminCharacter,
  renderAdminCharacterList,
  createCoreStateEditorCard,
  renderMemoryManager,
  createWorldLoreCard,
  onTriggerStageGeneration,
  onApplyProposal,
  onDismissProposal,
  onGenerateStages,
  onAddStatusCondition,
  onRemoveStatusCondition,
  onEditMessage,
  onReplyMessage,
  onDeleteMessage,
  onReactionChange,
  onSelectCharacter,
  onBuildSystemContext,
  onInlineRegenerate,
  onGenerateLoreTriggers,
  onImproveLoreContent,
  onRefineCharacter,
  parseThoughtAndContent,
  escapeHtml,
  autoResizeComposer,
  renderPersonaList,
  selectAdminPersona,
  adoptCharacterAsPersona,
  openPersonaFromCharDialog,
  switchSidebarTab,
  switchRightSidebarTab,
  switchSettingsTab,
  initSettingsTabs,
  renderGmScenes,
  onSelectGmScene,
  onEditGmScene,
  renderDirectivesBar,
  checkAndCompleteDirectives,
  toggleDirectiveMode,
  updateStudioLivePreview,
  renderSessionCodex,
  collectSessionCodexFromUI,
  switchCodexTab,
  createCodexCharacterCard,
  createCodexThreadItem,
  createCodexEventItem
} from "./js/ui.js";
import {
  appendMessage,
  deleteCharacterChats,
  getDefaultStatesForCharacter,
  getStageBehavior,
  getStateType,
  isBuiltinState,
  isValidStateKey,
  BUILTIN_STATES,
  loadApiSettings,
  loadApiKey,
  loadNordrouterApiKey,
  saveNordrouterApiKey,
  loadChatStates,
  loadCharacters,
  loadChats,
  loadGlobalSystemPrompt,
  loadModelsCache,
  loadModelsMetadataCache,
  loadTotalSpent,
  loadChatSummaries,
  loadChatSummarizedMessageCount,
  saveModelsMetadataCache,
  saveTotalSpent,
  saveLastPromptTokens,
  saveLastCompletionTokens,
  saveLastCost,
  loadChatFontSize,
  saveChatFontSize,
  loadDialogueColorTheme,
  saveDialogueColorTheme,
  saveChatSummaries,
  saveChatSummarizedMessageCount,
  saveChatSummarySnapshots,
  loadCustomStateTypes,
  loadCustomStateStages,
  normalizeStateValue,
  replaceLastAssistantMessage,
  saveApiSettings,
  saveApiKey,
  saveChatStates,
  saveCharacters,
  saveChats,
  saveGlobalSystemPrompt,
  saveModelsCache,
  saveCharacterDirectives,
  saveCustomStateTypes,
  saveCustomStateStages,
  loadChatMetadata,
  saveChatMetadata,
  syncStorageFromIndexedDB,
  getActiveChatId,
  setActiveChatId,
  createDuoChatId,
  getDuoParticipants,
  isDuoChat,
  getDefaultDuoStates,
  loadPersonas,
  savePersonas,
  getActivePersonaId,
  setActivePersonaId,
  getActivePersona,
  saveGmScenes,
  saveActiveGmSceneId,
  saveGmChats,
  saveSidebarTab,
  loadPinnedFacts,
  savePinnedFacts,
  getSessionMemory,
  saveSessionMemory
} from "./services/storage.js";
import {
  extractStructuredMemoryFromLLM,
  createDefaultSessionMemory,
  smartMergeSessionMemory,
  getCodexProcessedCount,
  CODEX_AUTO_UPDATE_EVERY,
  CODEX_AUTO_UPDATE_MAX_MESSAGES
} from "./services/sessionMemoryService.js";
import {
  fetchModels,
  fetchModelEndpoints,
  getEffectiveModelPricing,
  fetchOpenRouterCredits,
  mapOpenRouterError,
  sendMessageNonStream as rawSendMessageNonStream,
  sendMessageStream as rawSendMessageStream
} from "./services/openrouter.js";
import { getEffectiveApiConfig } from "./services/apiHelper.js";
import { retrieveRelevantMemories, retrieveRelevantMemoriesAsync, buildRagIndex } from "./services/ragService.js";
import { checkDirectivesWithJev, testJevConnection } from "./services/jevService.js";
import { generateWorldLoreFromChat } from "./services/lorebook.js";

const sendMessageStream = (options) => {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  return rawSendMessageStream({
    repetitionPenalty: apiConfig.repetitionPenalty,
    presencePenalty: apiConfig.presencePenalty,
    frequencyPenalty: apiConfig.frequencyPenalty,
    topP: apiConfig.topP,
    minP: apiConfig.minP,
    apiProvider: apiConfig.apiProvider,
    ...options
  });
};

const sendMessageNonStream = (options) => {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  return rawSendMessageNonStream({
    repetitionPenalty: apiConfig.repetitionPenalty,
    presencePenalty: apiConfig.presencePenalty,
    frequencyPenalty: apiConfig.frequencyPenalty,
    topP: apiConfig.topP,
    minP: apiConfig.minP,
    apiProvider: apiConfig.apiProvider,
    ...options
  });
};

// Imported modular components
import { checkLoreBookTriggers } from "./js/stemmer.js";
import { scanLoreBookAndBuildContent, generateLoreTriggers, improveLoreContent } from "./services/lorebook.js";
import { replaceMacros, buildSystemContext, buildApiMessages, buildGroupScenePrompt, getStabsEdhPrompt, stripThoughtTags } from "./services/promptBuilder.js";
import {
  startCharacterWizard,
  handleWizardInput,
  finalizeWizardCharacter,
  startPromptWizard,
  handlePromptWizardInput,
  startCharacterRefineWizard,
  handleRefineWizardInput,
  populateStudioFromProfile,
  collectStudioData
} from "./js/wizards.js";
import {
  parseCharacterCardFile,
  adaptCharacterCardToRussian
} from "./services/cardImportService.js";
import {
  analyzeAndEnhanceCharacter,
  ENHANCE_PRESETS
} from "./services/characterEnhanceService.js";
import {
  exportAllDataJSON,
  exportData,
  clearEnvironment,
  clearData,
  importDataFromFile,
  normalizeApiSettings,
  updateActiveModelBadge,
  updateQuickModelSwitcherUI,
  switchQuickModel,
  updateProviderUI,
  syncApiSettingsFromInputs,
  updateThinkingToggleVisual,
  ensureModelSelection,
  renderModelOptions,
  updateSettingsModelDetails,
  updateModelProvidersUI
} from "./js/config.js";

if (typeof window !== "undefined") {
  window.exportAllDataJSON = exportAllDataJSON;
  window.exportData = exportData;
  window.clearEnvironment = clearEnvironment;
  window.clearData = clearData;
}

// --- Global helper to find active character ---
function getActiveCharacter() {
  return state.characters.find((c) => c.id === state.activeCharacterId) || null;
}

function ensureActiveCharacter() {
  if (!state.activeCharacterId || !getActiveCharacter()) {
    state.activeCharacterId = state.characters[0]?.id || "";
  }
}

function parseLlmJson(rawText) {
  if (!rawText) return null;
  let clean = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  clean = clean.replace(/:\s*\+(\d+)/g, ': $1');

  let inString = false;
  let escaped = false;
  let processed = "";
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '"' && !escaped) {
      inString = !inString;
      processed += char;
    } else if (inString) {
      if (char === '\n') {
        processed += '\\n';
      } else if (char === '\r') {
        processed += '\\r';
      } else if (char === '\t') {
        processed += '\\t';
      } else if (char === '\\') {
        escaped = !escaped;
        processed += char;
      } else {
        escaped = false;
        processed += char;
      }
    } else {
      escaped = false;
      processed += char;
    }
  }
  processed = processed.replace(/,(\s*[\]}])/g, '$1');
  return JSON.parse(processed);
}

async function refineCharacterProfile(instruction) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    if (dom.aiRefinerFeedback) dom.aiRefinerFeedback.textContent = "API key required.";
    return;
  }

  if (!instruction) return;

  if (dom.aiRefineBtn) dom.aiRefineBtn.disabled = true;
  if (dom.aiRefinerFeedback) dom.aiRefinerFeedback.textContent = "Analyzing and refining character profile...";

  const name = dom.characterName.value.trim() || "Character";
  const personality = dom.characterPersonality.value.trim();
  const scenario = dom.characterScenario.value.trim();
  const firstMessage = dom.characterFirstMessage ? dom.characterFirstMessage.value.trim() : "";
  const description = dom.characterDescription.value.trim();
  const systemPrompt = dom.characterPrompt.value.trim();
  const traits = dom.characterTraits.value.trim();
  const exampleDialogs = dom.characterExampleDialogs.value.trim();

  const isRuRefine = (state.apiSettings?.chatLanguage || "ru") === "ru";
  const refineLang = isRuRefine ? "Russian" : "English";
  const prompt = `You are an expert AI Character Designer and Prompt Engineer.
We have an existing character profile:
Name: ${name}
Description: ${description || "(empty)"}
Personality: ${personality || "(empty)"}
Scenario (Background scene setting - strictly in third person, no dialogue): ${scenario || "(empty)"}
First Message (Greeting dialog line - written in character with actions in *...* and direct speech in quotes): ${firstMessage || "(empty)"}
System Prompt: ${systemPrompt || "(empty)"}
Traits: ${traits || "(empty)"}
Example Dialogs: ${exampleDialogs || "(empty)"}

The user wants to refine/improve this character profile based on the following instruction:
"${instruction}"

Your task:
1. Rewrite and improve the fields to fully incorporate the user's instructions.
2. Keep the character's original core elements, but expand or refine their personality traits, scenario settings, first message greeting, custom prompt instructions, and example dialogues to reflect the new direction.
3. Keep the output language of descriptions/personality/dialogues/scenario/firstMessage in ${refineLang}.
4. Output a valid, clean JSON object containing EXACTLY these keys:
{
  "personality": "...",
  "scenario": "...",
  "firstMessage": "...",
  "description": "...",
  "systemPrompt": "...",
  "traits": ["Trait1", "Trait2"],
  "exampleDialogs": "..."
}
Output ONLY the JSON block. Do not include markdown codeblocks (such as \`\`\`), conversational filler, or explanations.`;

  try {
    const messages = [{ role: "user", content: prompt }];
    const response = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: dom.characterModelSelect?.value || apiConfig.model,
      messages,
      temperature: 0.7,
      maxTokens: 1800
    });

    const updated = parseLlmJson(response);

    if (updated) {
      if (updated.personality !== undefined) dom.characterPersonality.value = updated.personality;
      if (updated.scenario !== undefined) dom.characterScenario.value = updated.scenario;
      if (updated.firstMessage !== undefined && dom.characterFirstMessage) dom.characterFirstMessage.value = updated.firstMessage;
      if (updated.description !== undefined) dom.characterDescription.value = updated.description;
      if (updated.systemPrompt !== undefined) dom.characterPrompt.value = updated.systemPrompt;
      if (updated.exampleDialogs !== undefined) dom.characterExampleDialogs.value = updated.exampleDialogs;
      if (Array.isArray(updated.traits)) {
        dom.characterTraits.value = updated.traits.join(", ");
      }

      if (dom.aiRefinerInstruction) dom.aiRefinerInstruction.value = "";
      if (dom.aiRefinerFeedback) dom.aiRefinerFeedback.textContent = "✨ Доработка завершена! Проверьте поля выше и нажмите Save.";
    } else {
      if (dom.aiRefinerFeedback) dom.aiRefinerFeedback.textContent = "Не удалось обновить профиль: неверный формат ответа.";
    }
  } catch (error) {
    console.error("Character refiner failed:", error);
    if (dom.aiRefinerFeedback) dom.aiRefinerFeedback.textContent = `Ошибка: ${error.message}`;
  } finally {
    if (dom.aiRefineBtn) dom.aiRefineBtn.disabled = false;
  }
}

async function triggerAutoFirstMessage(characterId) {
  if (state.isStreaming) return;
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) return;

  const character = state.characters.find(c => c.id === characterId);
  if (!character) return;
  
  const activeChatId = getActiveChatId(characterId);
  const now = Date.now();
  state.chats = appendMessage(state.chats, activeChatId, {
    role: "assistant",
    content: "",
    timestamp: now
  });
  saveChats(state.chats);
  renderMessages();
  
  const promptOverride = "[System Instruction: This is the start of the chat. Generate your very first greeting to the user based on your personality and scenario. Do not include any out-of-character text.]";
  
  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();
  const requestMessages = buildApiMessages(character, promptOverride);

  state.isStreaming = true;
  if (dom.sendBtn) dom.sendBtn.disabled = true;
  setStatus("Assistant is typing...");
  
  try {
    let finalText = "";
    try {
      finalText = await sendMessageStream({
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        messages: requestMessages,
        temperature: apiConfig.temperature,
        maxTokens: apiConfig.maxTokens,
        signal: state.abortController.signal,
        enableThinking: apiConfig.enableThinking,
        onToken: (aggregated) => {
          state.chats = replaceLastAssistantMessage(state.chats, activeChatId, aggregated);
          renderMessagesThrottled();
        }
      });
    } catch (streamError) {
      // Stream failed — use non-stream fallback and save its output
      finalText = await sendMessageNonStream({
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: apiConfig.model,
        messages: requestMessages,
        temperature: apiConfig.temperature,
        maxTokens: apiConfig.maxTokens,
        signal: state.abortController.signal,
        enableThinking: apiConfig.enableThinking
      });
      state.chats = replaceLastAssistantMessage(state.chats, activeChatId, finalText);
    }
    saveChats(state.chats);
    setStatus("");
  } catch (err) {
    const errorMsg = mapOpenRouterError(err);
    state.chats = replaceLastAssistantMessage(state.chats, activeChatId, `*Error generating first message: ${errorMsg}*`);
    saveChats(state.chats);
    setStatus("");
  } finally {
    state.retryStatus = null;
    state.isStreaming = false;
    if (dom.sendBtn) dom.sendBtn.disabled = false;
    renderMessages();
  }
}

async function generateStagesForState(character, stateKey) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    console.warn("[Stages] Cannot generate stages: API key is missing.");
    return null;
  }

  const isRuStages = (state.apiSettings?.chatLanguage || "ru") === "ru";
  const stageLang = isRuStages ? "Russian" : "English";
  const stageExample = isRuStages
    ? `["Полное расслабление", "Легкая натянутость", "Ощутимое напряжение", "Наэлектризованность", "Предел терпения", "Взрывной пик"]`
    : `["Completely calm", "Slight tension", "Noticeable tension", "Charged atmosphere", "Breaking point", "Explosive peak"]`;
  const prompt = `You are a creative roleplay engine assistant.
We have a character:
Name: ${character.name}
Description: ${character.description || "No description"}
Personality: ${character.personality || "No personality details"}

We are tracking a custom numeric state for this character called "${stateKey}" (from 0 to 100, where 0 is minimum and 100 is maximum).
We need to divide this state into exactly 6 progressive stages of intensity:
Stage 1 (0-16): Lowest intensity / absence of the state
Stage 2 (17-33): Very mild / first signs
Stage 3 (34-50): Moderate / noticeable intensity
Stage 4 (51-66): High / strong intensity
Stage 5 (67-83): Very high / critical intensity
Stage 6 (84-100): Maximum intensity / peak of the state

Rules:
1. Generate names in ${stageLang} for each of these 6 stages.
2. The names MUST represent a clear, logical, and linear progression of intensity of "${stateKey}".
3. Avoid overly abstract or unrelated metaphors (like weather/rain/nature unless the state key itself is weather-related). The names should make it immediately obvious to the user how intense the "${stateKey}" is.
4. Keep each stage name short (1-3 words).
5. The naming style should match the character's personality and tone (e.g. cold, dramatic, playful, formal).
6. Return ONLY a valid JSON array of exactly 6 strings. Output nothing else, no markdown codeblocks, no intro, no explanation.

Example for state "tension":
${stageExample}`;


  let response = "";
  try {
    const messages = [{ role: "user", content: prompt }];
    response = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      messages,
      temperature: 0.3,
      maxTokens: 300
    });
    
    const parsed = parseStagesFromText(response);
    if (parsed) {
      return parsed;
    } else {
      console.warn("[Stages] Generated stages format invalid or could not be parsed:", response);
    }
  } catch (error) {
    console.error("[Stages] Failed to parse generated stages. Response was:", response, "Error:", error);
  }
  return null;
}

function triggerStageGeneration(character, stateKey) {
  const charId = character.id;
  const stagesKey = `${charId}_${stateKey}`;
  
  if (state.customStateStages[charId] && state.customStateStages[charId][stateKey]) {
    return;
  }
  
  if (state.generatingStages[stagesKey]) {
    return;
  }
  
  state.generatingStages[stagesKey] = true;
  console.log(`[Stages] Triggered stage generation for: ${stateKey} (${character.name})`);
  
  generateStagesForState(character, stateKey).then((stages) => {
    delete state.generatingStages[stagesKey];
    if (stages) {
      if (!state.customStateStages[charId]) {
        state.customStateStages[charId] = {};
      }
      state.customStateStages[charId][stateKey] = stages;
      saveCustomStateStages(state.customStateStages);
      console.log(`[Stages] Saved stages for ${stateKey}:`, stages);
      addEventLogEntry(charId, `System generated 6 stages for state "${stateKey}": ${stages.join(", ")}`);
    } else {
      if (!state.customStateStages[charId]) {
        state.customStateStages[charId] = {};
      }
      state.customStateStages[charId][stateKey] = [
        `${stateKey}: Низкий уровень`,
        `${stateKey}: Порог проявления`,
        `${stateKey}: Умеренный уровень`,
        `${stateKey}: Выраженный уровень`,
        `${stateKey}: Высокий уровень`,
        `${stateKey}: Максимальный пик`
      ];
      saveCustomStateStages(state.customStateStages);
      console.log(`[Stages] Saved fallback stages for ${stateKey}`);
    }
    renderStates();
    renderProgressBar();
  });
}

function parseStagesFromText(text) {
  if (!text) return null;
  const clean = text.trim();

  const arrayMatch = clean.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const fixedJson = arrayMatch[0].replace(/'/g, '"');
      const parsed = JSON.parse(fixedJson);
      if (Array.isArray(parsed) && parsed.length === 6) {
        return parsed.map(item => String(item).trim());
      }
    } catch (e) {
      // Ignore
    }
  }

  const doubleQuoted = [...clean.matchAll(/"([^"]+)"/g)].map(m => m[1].trim());
  if (doubleQuoted.length === 6) {
    return doubleQuoted;
  }
  const singleQuoted = [...clean.matchAll(/'([^']+)'/g)].map(m => m[1].trim());
  if (singleQuoted.length === 6) {
    return singleQuoted;
  }

  const lines = clean.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  const cleanedLines = lines.map(line => {
    let cleaned = line
      .replace(/^(?:stage|этап)?\s*\d+\s*[:\.\)-]\s*/i, "")
      .replace(/^[\-\*\+]\s*/, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    
    const sepMatch = cleaned.match(/^([^\-\—\:]+)\s*[\-\—\:]\s*(.+)$/);
    if (sepMatch) {
      const prefix = sepMatch[1].trim();
      if (prefix.split(/\s+/).length <= 4) {
        cleaned = prefix;
      }
    }
    return cleaned;
  }).filter(line => line.length > 0);

  if (cleanedLines.length === 6) {
    return cleanedLines;
  }

  const shortLines = cleanedLines.filter(l => l.length > 0 && l.length <= 40);
  if (shortLines.length === 6) {
    return shortLines;
  }

  return null;
}

function initDefaultStatesForCharacter(characterId) {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return;
  const chatId = getActiveChatId(characterId);
  if (!chatId) return;
  if (Object.keys(state.chatStates[chatId] || {}).length > 0) return;
  
  const defaults = { mood: "neutral", relationshipStage: "Stranger" };
  
  if (character.coreStates && Array.isArray(character.coreStates)) {
    character.coreStates.forEach(cs => {
      defaults[cs.key] = cs.defaultValue ?? 20;
      
      if (!state.customStateStages[characterId]) {
        state.customStateStages[characterId] = {};
      }
      state.customStateStages[characterId][cs.key] = cs.stages;
      state.customStateTypes[cs.key] = "number";
    });
    saveCustomStateStages(state.customStateStages);
    saveCustomStateTypes(state.customStateTypes);
  }
  
  state.chatStates[chatId] = defaults;
  saveChatStates(state.chatStates);
  renderProgressBar();
  renderMoodIndicator();
}

function updateStateValue(characterId, key, value) {
  const activeChatId = String(characterId).startsWith("chat_") ? characterId : (getActiveChatId(characterId) || characterId);
  const originalValue = getChatStates(activeChatId)[key];
  const type = getStateType(key, state.customStateTypes);
  const normalized = normalizeStateValue(type, value, key);

  console.log(`State updated: ${key} - ${originalValue} → ${normalized}`);

  state.chatStates = {
    ...state.chatStates,
    [activeChatId]: {
      ...getChatStates(activeChatId),
      [key]: normalized
    }
  };

  pushAction("state_add", { characterId: activeChatId, key, value: normalized, oldValue: originalValue }, { action: "state_delete" });
  saveChatStates(state.chatStates);
  addEventLogEntry(activeChatId, `Manual update: ${key.toUpperCase()} set to "${normalized}" (was "${originalValue}")`);
  renderProgressBar();
  renderMoodIndicator();
  renderStates();
  showStateNotification(`${key.toUpperCase()} set to "${normalized}"`);
  setStatus(`${key} updated to ${normalized}.`);
}

function handleMoodChange(mood) {
  const character = getActiveCharacter();
  if (!character) return;
  updateStateValue(character.id, "mood", mood);
}

function modifyValueByTraits(character, key, value) {
  if (!character) return { value, explanation: "" };
  const hasRegular = character.traits && character.traits.length > 0;
  const hiddenEnabled = state.apiSettings?.enableHiddenTraits !== false;
  const hasHidden = hiddenEnabled && character.hiddenTraits && character.hiddenTraits.length > 0;
  if (!hasRegular && !hasHidden) return { value, explanation: "" };
  
  let val = Number(value);
  if (isNaN(val)) return { value, explanation: "" };
  
  let originalVal = val;
  let explanations = [];
  let hasHiddenEffect = false;

  // Strip duo_ prefix so traits work correctly for duo secondary states (e.g. "duo_affinity" -> "affinity")
  const isDuo = key.startsWith("duo_");
  const normalizedKey = isDuo ? key.replace(/^duo_/, "") : key;
  
  // ── Regular Traits ──
  if (hasRegular) {
    if (character.traits.includes("Cold")) {
      if (normalizedKey === "affinity") {
        val = Math.round(val * 0.6);
        explanations.push("Cold trait reduced Affinity gain/loss");
      }
    }
    
    if (character.traits.includes("Shy")) {
      if (normalizedKey === "affinity") {
        // For duo secondary characters, read duo_trust; otherwise read trust
        const activeChatId = getActiveChatId(character.id);
        const currentStates = getChatStates(activeChatId);
        const trust = isDuo ? (currentStates.duo_trust ?? 25) : (currentStates.trust ?? 25);
        if (val > 0 && trust < 40) {
          val = Math.round(val * 0.5);
          explanations.push("Shy trait reduced Affinity gain because Trust is low (<40%)");
        }
      } else if (normalizedKey === "trust") {
        if (val > 0) {
          val = Math.round(val * 1.5);
          explanations.push("Shy trait boosted Trust gain");
        }
      }
    }
    
    if (character.traits.includes("Expressive")) {
      if (normalizedKey === "affinity") {
        val = Math.round(val * 1.3);
        explanations.push("Expressive trait amplified Affinity change");
      } else if (normalizedKey === "trust") {
        val = Math.round(val * 1.2);
        explanations.push("Expressive trait amplified Trust change");
      }
    }
  }

  // ── Hidden Traits (Secret Modifiers) ──
  if (hasHidden) {
    const hidden = character.hiddenTraits;
    const activeChatId = getActiveChatId(character.id);
    const currentStates = getChatStates(activeChatId);
    const trust = isDuo ? (currentStates.duo_trust ?? 25) : (currentStates.trust ?? 25);

    // 1. Tsundere: < 50% trust cuts affinity gain by 50%; >= 50% trust boosts it by 1.5x
    if (hidden.includes("Tsundere")) {
      if (normalizedKey === "affinity" && val > 0) {
        if (trust < 50) {
          val = Math.round(val * 0.5);
          hasHiddenEffect = true;
        } else {
          val = Math.round(val * 1.5);
          hasHiddenEffect = true;
        }
      }
    }

    // 2. Obsessive: +50% to positive affinity/trust; x2 penalty on drops
    if (hidden.includes("Obsessive")) {
      if (normalizedKey === "affinity" || normalizedKey === "trust") {
        if (val > 0) {
          val = Math.round(val * 1.5);
          hasHiddenEffect = true;
        } else if (val < 0) {
          val = Math.round(val * 2.0);
          hasHiddenEffect = true;
        }
      }
    }

    // 3. Volatile: amplify any stat change by x1.6
    if (hidden.includes("Volatile")) {
      if (val !== 0) {
        val = Math.round(val * 1.6);
        hasHiddenEffect = true;
      }
    }

    // 4. Guarded: < 60% trust dampens gains (-40%); >= 60% trust doubles gains (x2)
    if (hidden.includes("Guarded")) {
      if ((normalizedKey === "affinity" || normalizedKey === "trust") && val > 0) {
        if (trust < 60) {
          val = Math.round(val * 0.6);
          hasHiddenEffect = true;
        } else {
          val = Math.round(val * 2.0);
          hasHiddenEffect = true;
        }
      }
    }

    // 5. Masochist / Submissive: soft drop on negative affinity; dampens fear
    if (hidden.includes("Masochist") || hidden.includes("Submissive")) {
      if (normalizedKey === "affinity" && val < 0) {
        val = Math.round(val * 0.5);
        hasHiddenEffect = true;
      } else if (normalizedKey === "fear" && val > 0) {
        val = Math.round(val * 0.6);
        hasHiddenEffect = true;
      }
    }

    // 6. Unpredictable: random variance of ±30-50%
    if (hidden.includes("Unpredictable")) {
      if (val !== 0) {
        const factor = 0.6 + Math.random() * 0.8;
        val = Math.round(val * factor);
        if (val === 0 && originalVal !== 0) val = originalVal > 0 ? 1 : -1;
        hasHiddenEffect = true;
      }
    }
  }
  
  if (val !== originalVal) {
    if (hasHiddenEffect) {
      explanations.push("??? Скрытый фактор изменил значение");
    }
    const changeText = val >= 0 ? `+${val}` : `${val}`;
    const origText = originalVal >= 0 ? `+${originalVal}` : `${originalVal}`;
    return { value: val, explanation: ` (${explanations.join("; ")}, was ${origText} -> now ${changeText})` };
  }
  
  return { value: val, explanation: "" };
}


function addEventLogEntry(characterId, message) {
  const activeChatId = String(characterId).startsWith("chat_") ? characterId : (getActiveChatId(characterId) || characterId);
  const states = getChatStates(activeChatId);
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  
  const prevLog = Array.isArray(states.eventLog) ? states.eventLog : [];
  const newEntry = { timestamp, message };
  const newLog = [...prevLog, newEntry].slice(-50);
  
  state.chatStates = {
    ...state.chatStates,
    [activeChatId]: {
      ...states,
      eventLog: newLog
    }
  };
  saveChatStates(state.chatStates);
  renderEventLog();
}

function applyStageUpdate(characterId, stageUpdate) {
  if (!stageUpdate) return;
  const activeChatId = String(characterId).startsWith("chat_") ? characterId : (getActiveChatId(characterId) || characterId);
  const oldStage = getChatStates(activeChatId).relationshipStage || "Stranger";
  state.chatStates[activeChatId] = {
    ...getChatStates(activeChatId),
    relationshipStage: stageUpdate.stage
  };
  saveChatStates(state.chatStates);
  
  const logMsg = `STAGE changed from "${oldStage}" to "${stageUpdate.stage}"` + 
                 (stageUpdate.description ? ` | Reason: ${stageUpdate.description}` : "");
  addEventLogEntry(activeChatId, logMsg);
  
  renderProgressBar();
  showStateNotification(`Relationship Stage: ${stageUpdate.stage}`);
  setStatus(`Stage updated: ${stageUpdate.stage}.`);
}

function switchActiveCharacter(characterId) {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  state.isStreaming = false;
  if (dom.sendBtn) dom.sendBtn.disabled = false;

  state.activeCharacterId = characterId;
  state.selectedMessageIndex = null;
  state.replyingToMessageIndex = null;
  state.isGmModeEnabled = false;
  
  if (characterId) {
    localStorage.setItem("openrouter_active_character_id_v1", characterId);
    
    const character = state.characters.find(c => c.id === characterId);
    if (character && character.model) {
      state.apiSettings.selectedModel = character.model;
      saveApiSettings(state.apiSettings);
    }
    
    let chats = state.chatMetadata[characterId] || [];
    if (!chats.length) {
      const newChatId = `chat_${characterId}_${Date.now()}`;
      chats = [
        {
          id: newChatId,
          name: "Chat 1 (Stranger)",
          createdAt: Date.now(),
          isGmModeEnabled: false,
          activeGroupCharacterIds: []
        }
      ];
      state.chatMetadata[characterId] = chats;
      saveChatMetadata(state.chatMetadata);
      setActiveChatId(characterId, newChatId);
    }
    
    let activeChatId = getActiveChatId(characterId);
    if (!activeChatId || !chats.some(c => c.id === activeChatId)) {
      activeChatId = chats[0].id;
      setActiveChatId(characterId, activeChatId);
    }
    
    state.pendingStateProposals[activeChatId] = [];
    initDefaultStatesForCharacter(characterId);
  } else {
    localStorage.removeItem("openrouter_active_character_id_v1");
  }

  renderChatSelector();
  renderModelOptions();
  renderCharacters();
  renderMessages();
  renderStates();
  renderStateProposals();
  renderProgressBar();
  renderMoodIndicator();
  renderEventLog();
  renderMemoryManager();

  if (characterId) {
    const activeChatId = getActiveChatId(characterId);
    const chat = state.chats[activeChatId] || [];
    if (chat.length === 0) {
      const character = state.characters.find(c => c.id === characterId);
      const mode = character?.firstMessageMode || "assistant";
      if (mode === "assistant") {
        if (character && character.firstMessage) {
          state.chats = appendMessage(state.chats, activeChatId, {
            role: "assistant",
            content: replaceMacros(character.firstMessage, character),
            timestamp: Date.now()
          });
          saveChats(state.chats);
          renderMessages();
        } else {
          triggerAutoFirstMessage(characterId);
        }
      } else {
        renderMessages();
      }
    }
  }
}

// --- GM Scene Mode Helpers ---

let editingGmSceneId = null;
let editingGmSceneNpcs = [];
let editingNpcId = null;

function ensureActiveGmScene() {
  if (!state.gmScenes.some(s => s.id === state.activeGmSceneId)) {
    state.activeGmSceneId = state.gmScenes[0]?.id || "";
    saveActiveGmSceneId(state.activeGmSceneId);
  }
}

async function switchActiveGmScene(sceneId) {
  state.activeGmSceneId = sceneId;
  saveActiveGmSceneId(sceneId);

  if (sceneId) {
    let chats = state.chatMetadata[sceneId] || [];
    if (!chats.length) {
      const newChatId = `chat_${sceneId}_${Date.now()}`;
      chats = [
        {
          id: newChatId,
          name: "Scene Start",
          createdAt: Date.now(),
          isGmModeEnabled: true,
          activeGroupCharacterIds: []
        }
      ];
      state.chatMetadata[sceneId] = chats;
      saveChatMetadata(state.chatMetadata);
      setActiveChatId(sceneId, newChatId);
      
      state.chats[newChatId] = [{
        role: "assistant",
        content: "[CHARACTER: Narrator]\nСцена создана. Напишите первое сообщение, чтобы начать историю.",
        timestamp: Date.now(),
        isGmMessage: true
      }];
      saveChats(state.chats);
    }

    let activeChatId = getActiveChatId(sceneId);
    if (!activeChatId || !chats.some(c => c.id === activeChatId)) {
      activeChatId = chats[0].id;
      setActiveChatId(sceneId, activeChatId);
    }
  }

  state.isGmModeEnabled = true;

  renderChatSelector();
  renderGmScenes();
  renderMessages();
  
  const scene = state.gmScenes.find(s => s.id === sceneId);
  if (scene) {
    setStatus(`Switched to GM Scene: ${scene.name}`);
  }
}

function openGmSceneDialog(sceneId) {
  if (!sceneId) {
    editingGmSceneId = null;
    editingGmSceneNpcs = [];
    if (dom.gmSceneNameInput) dom.gmSceneNameInput.value = "";
    if (dom.gmSceneScenarioInput) dom.gmSceneScenarioInput.value = "";
    if (dom.gmScenePromptInput) {
      dom.gmScenePromptInput.value = "Ты — Сценарист и Ведущий (GM). Твоя задача — отыгрывать ВСЕХ персонажей из блока <Active_Characters> и нейтрального Рассказчика.\nПиши живым художественным языком. Описывай действия, окружение и диалоги.\nКРИТИЧЕСКИ ВАЖНО: Каждый персонаж обязан строго соблюдать свою личность и манеру речи.\nКРИТИЧЕСКИ ВАЖНО: Весь текст, диалоги, мысли, описания и действия пиши СТРОГО на русском языке.\nКАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать от имени Пользователя или генерировать его реплики, мысли и действия.";
    }
    if (dom.gmSceneDialogTitle) dom.gmSceneDialogTitle.textContent = "🎭 Create GM Scene";
    if (dom.gmSceneDeleteBtn) dom.gmSceneDeleteBtn.style.display = "none";
  } else {
    const scene = state.gmScenes.find(s => s.id === sceneId);
    if (!scene) return;
    editingGmSceneId = sceneId;
    editingGmSceneNpcs = JSON.parse(JSON.stringify(scene.participants || []));
    if (dom.gmSceneNameInput) dom.gmSceneNameInput.value = scene.name;
    if (dom.gmSceneScenarioInput) dom.gmSceneScenarioInput.value = scene.scenario || "";
    if (dom.gmScenePromptInput) dom.gmScenePromptInput.value = scene.gmSystemPrompt || "";
    if (dom.gmSceneDialogTitle) dom.gmSceneDialogTitle.textContent = "🎭 Edit GM Scene";
    if (dom.gmSceneDeleteBtn) dom.gmSceneDeleteBtn.style.display = "block";
  }
  renderEditingNpcsList();
  if (dom.gmSceneDialog) dom.gmSceneDialog.showModal();
}

function renderEditingNpcsList() {
  if (!dom.gmSceneNpcList) return;
  dom.gmSceneNpcList.innerHTML = "";
  
  if (editingGmSceneNpcs.length === 0) {
    dom.gmSceneNpcList.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 12px; text-align: center;">Пока нет участников в этой сцене.</div>`;
    return;
  }
  
  editingGmSceneNpcs.forEach((npc) => {
    const item = document.createElement("div");
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.style.padding = "6px 8px";
    item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    
    const info = document.createElement("div");
    info.style.flex = "1";
    info.style.overflow = "hidden";
    info.style.marginRight = "10px";

    const badges = [];
    if (npc.speech?.trim()) badges.push("🗣️ Голос");
    if (npc.personality?.trim()) badges.push("🧠 Характер");
    if (npc.behavior?.trim()) badges.push("🎭 Привычки");
    if (npc.systemPrompt?.trim()) badges.push("⚙️ Инд. Промпт");
    const badgeText = badges.length > 0 ? ` [${badges.join(", ")}]` : "";

    info.innerHTML = `
      <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
        ${escapeHtml(npc.name)} <span style="font-size: 10px; color: #a1a1aa; font-weight: normal;">${escapeHtml(badgeText)}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(npc.speech || npc.personality || npc.description || "Нет дополнительных деталей")}</div>
    `;
    
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";
    
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-create-small";
    editBtn.style.background = "rgba(255,255,255,0.05)";
    editBtn.style.border = "1px solid var(--border)";
    editBtn.style.padding = "4px 8px";
    editBtn.style.borderRadius = "4px";
    editBtn.style.cursor = "pointer";
    editBtn.style.fontSize = "10px";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openNpcEditDialog(npc.id));
    
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-create-small";
    delBtn.style.background = "rgba(239,68,68,0.1)";
    delBtn.style.border = "1px solid rgba(239,68,68,0.2)";
    delBtn.style.color = "#f87171";
    delBtn.style.padding = "4px 8px";
    delBtn.style.borderRadius = "4px";
    delBtn.style.cursor = "pointer";
    delBtn.style.fontSize = "10px";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      editingGmSceneNpcs = editingGmSceneNpcs.filter(n => n.id !== npc.id);
      renderEditingNpcsList();
    });
    
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    
    item.appendChild(info);
    item.appendChild(actions);
    dom.gmSceneNpcList.appendChild(item);
  });
}

function openNpcEditDialog(npcId) {
  if (!npcId) {
    editingNpcId = null;
    if (dom.gmNpcNameInput) dom.gmNpcNameInput.value = "";
    if (dom.gmNpcGenderSelect) dom.gmNpcGenderSelect.value = "he/him";
    if (dom.gmNpcDescInput) dom.gmNpcDescInput.value = "";
    if (dom.gmNpcPersonalityInput) dom.gmNpcPersonalityInput.value = "";
    if (dom.gmNpcSpeechInput) dom.gmNpcSpeechInput.value = "";
    if (dom.gmNpcBehaviorInput) dom.gmNpcBehaviorInput.value = "";
    if (dom.gmNpcAppearanceInput) dom.gmNpcAppearanceInput.value = "";
    if (dom.gmNpcBackstoryInput) dom.gmNpcBackstoryInput.value = "";
    if (dom.gmNpcSystemPromptInput) dom.gmNpcSystemPromptInput.value = "";
    if (dom.gmNpcEditTitle) dom.gmNpcEditTitle.textContent = "👤 Создать персонажа";
  } else {
    const npc = editingGmSceneNpcs.find(n => n.id === npcId);
    if (!npc) return;
    editingNpcId = npcId;
    if (dom.gmNpcNameInput) dom.gmNpcNameInput.value = npc.name || "";
    if (dom.gmNpcGenderSelect) dom.gmNpcGenderSelect.value = npc.gender || "he/him";
    if (dom.gmNpcDescInput) dom.gmNpcDescInput.value = npc.description || "";
    if (dom.gmNpcPersonalityInput) dom.gmNpcPersonalityInput.value = npc.personality || "";
    if (dom.gmNpcSpeechInput) dom.gmNpcSpeechInput.value = npc.speech || "";
    if (dom.gmNpcBehaviorInput) dom.gmNpcBehaviorInput.value = npc.behavior || "";
    if (dom.gmNpcAppearanceInput) dom.gmNpcAppearanceInput.value = npc.appearance || "";
    if (dom.gmNpcBackstoryInput) dom.gmNpcBackstoryInput.value = npc.backstory || "";
    if (dom.gmNpcSystemPromptInput) dom.gmNpcSystemPromptInput.value = npc.systemPrompt || "";
    if (dom.gmNpcEditTitle) dom.gmNpcEditTitle.textContent = `👤 Редактировать: ${npc.name}`;
  }
  if (dom.gmNpcEditDialog) dom.gmNpcEditDialog.showModal();
}

function saveNpc() {
  const name = dom.gmNpcNameInput?.value.trim();
  if (!name) return alert("Имя персонажа обязательно!");

  const npcData = {
    name: name,
    gender: dom.gmNpcGenderSelect?.value || "he/him",
    description: dom.gmNpcDescInput?.value.trim() || "",
    personality: dom.gmNpcPersonalityInput?.value.trim() || "",
    speech: dom.gmNpcSpeechInput?.value.trim() || "",
    behavior: dom.gmNpcBehaviorInput?.value.trim() || "",
    appearance: dom.gmNpcAppearanceInput?.value.trim() || "",
    backstory: dom.gmNpcBackstoryInput?.value.trim() || "",
    systemPrompt: dom.gmNpcSystemPromptInput?.value.trim() || ""
  };
  
  if (editingNpcId === null) {
    editingGmSceneNpcs.push({
      id: 'npc_' + Date.now(),
      ...npcData
    });
  } else {
    const npc = editingGmSceneNpcs.find(n => n.id === editingNpcId);
    if (npc) {
      Object.assign(npc, npcData);
    }
  }
  
  renderEditingNpcsList();
  if (dom.gmNpcEditDialog) dom.gmNpcEditDialog.close();
}

function openImportNpcDialog() {
  if (!dom.gmSceneImportSelect) return;
  dom.gmSceneImportSelect.innerHTML = "";
  
  if (state.characters.length === 0) {
    alert("Нет созданных персонажей для импорта.");
    return;
  }
  
  state.characters.forEach((char) => {
    const opt = document.createElement("option");
    opt.value = char.id;
    opt.textContent = char.name;
    dom.gmSceneImportSelect.appendChild(opt);
  });
  
  if (dom.gmSceneImportDialog) dom.gmSceneImportDialog.showModal();
}

function confirmImportNpc() {
  const charId = dom.gmSceneImportSelect?.value;
  if (!charId) return;
  
  const char = state.characters.find(c => c.id === charId);
  if (!char) return;

  editingGmSceneNpcs.push({
    id: 'npc_imported_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    characterId: char.id,
    name: char.name,
    gender: char.gender || "he/him",
    description: char.description || "",
    personality: char.personality || "",
    speech: char.speech || "",
    behavior: char.behavior || "",
    appearance: char.appearance || "",
    backstory: char.backstory || "",
    systemPrompt: char.systemPrompt || ""
  });
  
  renderEditingNpcsList();
  if (dom.gmSceneImportDialog) dom.gmSceneImportDialog.close();
}

function saveGmScene() {
  const name = dom.gmSceneNameInput?.value.trim();
  const scenario = dom.gmSceneScenarioInput?.value.trim() || "";
  const prompt = dom.gmScenePromptInput?.value.trim() || "";
  if (!name) return alert("Scene name is required");
  
  if (editingGmSceneId === null) {
    const newSceneId = 'scene_' + Date.now();
    state.gmScenes.push({
      id: newSceneId,
      name: name,
      scenario: scenario,
      gmSystemPrompt: prompt,
      participants: editingGmSceneNpcs
    });
    saveGmScenes(state.gmScenes);
    switchActiveGmScene(newSceneId);
  } else {
    const scene = state.gmScenes.find(s => s.id === editingGmSceneId);
    if (scene) {
      scene.name = name;
      scene.scenario = scenario;
      scene.gmSystemPrompt = prompt;
      scene.participants = editingGmSceneNpcs;
    }
    saveGmScenes(state.gmScenes);
    if (state.activeGmSceneId === editingGmSceneId) {
      switchActiveGmScene(editingGmSceneId);
    } else {
      renderGmScenes();
    }
  }
  
  if (dom.gmSceneDialog) dom.gmSceneDialog.close();
}

function deleteGmScene() {
  if (!editingGmSceneId) return;
  if (!confirm("Are you sure you want to delete this scene and all of its chats?")) return;
  
  const chats = state.chatMetadata[editingGmSceneId] || [];
  chats.forEach(c => {
    delete state.chats[c.id];
    delete state.chatSummaries[c.id];
    delete state.chatSummarizedMessageCount[c.id];
    delete state.chatStates[c.id];
  });
  delete state.chatMetadata[editingGmSceneId];
  saveChatMetadata(state.chatMetadata);
  saveChats(state.chats);
  saveChatSummaries(state.chatSummaries);
  saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
  saveChatStates(state.chatStates);

  state.gmScenes = state.gmScenes.filter(s => s.id !== editingGmSceneId);
  saveGmScenes(state.gmScenes);
  
  ensureActiveGmScene();
  if (state.activeGmSceneId) {
    switchActiveGmScene(state.activeGmSceneId);
  } else {
    renderGmScenes();
    renderMessages();
  }
  
  if (dom.gmSceneDialog) dom.gmSceneDialog.close();
}

// --- Character Card Import & Adaptation (Chub AI / Tavern) ---

let currentImportingCard = null;

async function handleCardFile(file) {
  if (!file) return;
  try {
    setStatus("Чтение карточки персонажа...");
    const rawCard = await parseCharacterCardFile(file);
    currentImportingCard = rawCard;
    openCardImportDialog(rawCard);
    setStatus("Карточка загружена.");
  } catch (err) {
    console.error("[CardImport] Failed to parse file:", err);
    alert(`Ошибка чтения карточки персонажа: ${err.message}`);
    setStatus("Ошибка чтения карточки.");
  }
}

function openCardImportDialog(rawCard) {
  if (!dom.cardImportDialog) return;

  if (dom.cardImportAvatarPreview) {
    if (rawCard.avatarUrl) {
      dom.cardImportAvatarPreview.style.backgroundImage = `url("${rawCard.avatarUrl}")`;
      dom.cardImportAvatarPreview.textContent = "";
    } else {
      dom.cardImportAvatarPreview.style.backgroundImage = "";
      dom.cardImportAvatarPreview.textContent = "👤";
    }
  }

  if (dom.cardImportName) dom.cardImportName.textContent = rawCard.name || "Персонаж без имени";
  if (dom.cardImportDesc) dom.cardImportDesc.textContent = rawCard.description || rawCard.personality?.slice(0, 120) || "Нет описания";

  if (dom.cardImportFormatBadge) {
    const formatName = rawCard.formatVersion === "v2" ? "Chub / Tavern V2" : (rawCard.formatVersion === "v3" ? "Tavern V3" : (rawCard.formatVersion === "chub_definition" ? "Chub Def" : "Card V1"));
    dom.cardImportFormatBadge.textContent = `${rawCard.avatarUrl?.startsWith("data:image") ? "PNG " : ""}${formatName}`;
  }

  if (dom.cardImportLoreBadge) {
    const count = rawCard.lorebook ? rawCard.lorebook.length : 0;
    dom.cardImportLoreBadge.textContent = `📚 ${count} ${count === 1 ? "запись" : (count >= 2 && count <= 4 ? "записи" : "записей")} лорбука`;
  }

  if (dom.cardImportAltGreetingsBadge) {
    const count = rawCard.alternateGreetings ? rawCard.alternateGreetings.length : 0;
    dom.cardImportAltGreetingsBadge.textContent = `💬 ${count} альт. приветствий`;
  }

  if (dom.cardImportOriginalPreview) {
    dom.cardImportOriginalPreview.textContent = JSON.stringify({
      name: rawCard.name,
      description: rawCard.description,
      personality: rawCard.personality,
      scenario: rawCard.scenario,
      firstMessage: rawCard.firstMessage,
      alternateGreetings: rawCard.alternateGreetings,
      lorebookEntriesCount: rawCard.lorebook?.length || 0,
      tags: rawCard.tags
    }, null, 2);
  }

  if (dom.cardImportProgress) dom.cardImportProgress.style.display = "none";
  if (dom.cardImportError) dom.cardImportError.style.display = "none";
  if (dom.cardImportAdaptBtn) dom.cardImportAdaptBtn.disabled = false;
  if (dom.cardImportAsIsBtn) dom.cardImportAsIsBtn.disabled = false;

  dom.cardImportDialog.showModal();
}

async function executeCardAdaptation() {
  if (!currentImportingCard) return;

  const model = dom.cardImportModelSelect?.value || dom.wizardModelSelect?.value;

  if (dom.cardImportProgress) {
    dom.cardImportProgress.style.display = "flex";
    if (dom.cardImportProgressText) dom.cardImportProgressText.textContent = "Анализируем карточку персонажа...";
  }
  if (dom.cardImportError) dom.cardImportError.style.display = "none";
  if (dom.cardImportAdaptBtn) dom.cardImportAdaptBtn.disabled = true;
  if (dom.cardImportAsIsBtn) dom.cardImportAsIsBtn.disabled = true;

  try {
    const adaptedProfile = await adaptCharacterCardToRussian(
      currentImportingCard,
      model,
      (statusText) => {
        if (dom.cardImportProgressText) dom.cardImportProgressText.textContent = statusText;
      }
    );

    if (dom.cardImportDialog) dom.cardImportDialog.close();

    // Open character studio and populate with adapted profile
    openAdminDialog();
    startCharacterWizard();
    populateStudioFromProfile(adaptedProfile);

    if (adaptedProfile.lorebook && adaptedProfile.lorebook.length > 0) {
      renderLoreBookEditorList({ lorebook: adaptedProfile.lorebook });
    }

    showStateNotification(`Карточка «${adaptedProfile.name}» успешно адаптирована на русский язык!`);
    setStatus(`Character card "${adaptedProfile.name}" adapted to Russian.`);
  } catch (err) {
    console.error("[CardImport] Adaptation error:", err);
    if (dom.cardImportError) {
      dom.cardImportError.textContent = `Ошибка адаптации: ${err.message}`;
      dom.cardImportError.style.display = "block";
    }
  } finally {
    if (dom.cardImportProgress) dom.cardImportProgress.style.display = "none";
    if (dom.cardImportAdaptBtn) dom.cardImportAdaptBtn.disabled = false;
    if (dom.cardImportAsIsBtn) dom.cardImportAsIsBtn.disabled = false;
  }
}

function executeCardImportAsIs() {
  if (!currentImportingCard) return;
  if (dom.cardImportDialog) dom.cardImportDialog.close();
  executeDirectCharacterCreation(currentImportingCard);
}

// --- Character Catalog Dialog & Chub AI Integration ---

let currentCatalogTab = "curated";
let currentGenreFilter = "all";
let chubSearchDebounceTimer = null;
let lastChubResults = [];
let currentChubPage = 1;
let totalChubPages = 1;
let currentChubQuery = "";
const CHUB_PAGE_SIZE = 24;

function openCharacterCatalogDialog() {
  if (!dom.characterCatalogDialog) return;
  switchCatalogTab("curated");
  renderCuratedCatalog();
  dom.characterCatalogDialog.showModal();
}

function switchCatalogTab(tabKey) {
  currentCatalogTab = tabKey;

  const tabBtns = [
    { key: "curated", btn: dom.catalogTabCuratedBtn, content: dom.catalogTabCuratedContent },
    { key: "chub", btn: dom.catalogTabChubBtn, content: dom.catalogTabChubContent },
    { key: "url", btn: dom.catalogTabUrlBtn, content: dom.catalogTabUrlContent }
  ];

  tabBtns.forEach(({ key, btn, content }) => {
    if (btn) {
      if (key === tabKey) btn.classList.add("active");
      else btn.classList.remove("active");
    }
    if (content) {
      if (key === tabKey) {
        content.style.display = "flex";
        content.classList.add("active");
      } else {
        content.style.display = "none";
        content.classList.remove("active");
      }
    }
  });

  if (tabKey === "curated") {
    renderCuratedCatalog();
  } else if (tabKey === "chub" && (!lastChubResults || lastChubResults.length === 0)) {
    performChubSearch(dom.chubSearchInput?.value || "fantasy", false);
  }
}

function renderCuratedCatalog() {
  if (!dom.curatedCardsGrid) return;

  const query = (dom.curatedSearchInput?.value || "").trim().toLowerCase();
  let list = curatedCharacters;

  if (currentGenreFilter !== "all") {
    list = list.filter(c => c.genreKey === currentGenreFilter);
  }

  if (query) {
    list = list.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.tagline.toLowerCase().includes(query) ||
      (c.tags && c.tags.some(t => t.toLowerCase().includes(query)))
    );
  }

  dom.curatedCardsGrid.innerHTML = "";

  if (list.length === 0) {
    dom.curatedCardsGrid.innerHTML = `
      <div class="catalog-empty-state" style="grid-column: 1 / -1;">
        <span class="empty-icon">🔍</span>
        <p class="empty-title">Персонажи не найдены</p>
        <p class="empty-hint">Попробуйте выбрать другой жанр или очистить строку поиска.</p>
      </div>
    `;
    return;
  }

  list.forEach(char => {
    const cardEl = document.createElement("div");
    cardEl.className = "catalog-card";

    const tagsHtml = (char.tags || []).slice(0, 4).map(t => `<span class="catalog-tag">${escapeHtml(t)}</span>`).join("");
    const statesCount = char.coreStates ? char.coreStates.length : 0;
    const loreCount = char.lorebook ? char.lorebook.length : 0;

    cardEl.innerHTML = `
      <div class="catalog-card-header">
        <img class="catalog-card-avatar" src="${char.avatarUrl}" alt="${escapeHtml(char.name)}" />
        <div class="catalog-card-identity">
          <div class="catalog-card-name-row">
            <h4 class="catalog-card-name">${escapeHtml(char.name)}</h4>
            <span class="catalog-card-genre-badge">${escapeHtml(char.genre)}</span>
          </div>
          <div class="catalog-card-author">Авторская карточка Heaven Chat</div>
        </div>
      </div>
      <p class="catalog-card-tagline">${escapeHtml(char.tagline)}</p>
      <div class="catalog-card-tags">${tagsHtml}</div>
      <div class="catalog-card-meta-row">
        <span class="catalog-card-meta-item" title="Шкалы состояний">📊 ${statesCount} стейтов</span>
        <span class="catalog-card-meta-item" title="Записи лора">📚 ${loreCount} лорбук</span>
      </div>
      <div class="catalog-card-footer">
        <button type="button" class="btn-card-add-direct" data-curated-id="${char.id}">
          <span>➕ Добавить в чат</span>
        </button>
      </div>
    `;

    const addBtn = cardEl.querySelector(".btn-card-add-direct");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        importCuratedCharacter(char);
      });
    }

    dom.curatedCardsGrid.appendChild(cardEl);
  });
}

function importCuratedCharacter(charPreset) {
  const newId = `char_${Date.now()}`;
  const newCharacter = {
    id: newId,
    name: charPreset.name,
    personality: charPreset.personality,
    appearance: "",
    behavior: charPreset.personality,
    backstory: charPreset.description,
    speech: "",
    imagePrompt: "",
    avatarUrl: charPreset.avatarUrl,
    scenario: charPreset.scenario,
    description: charPreset.description,
    model: state.apiSettings?.model || "z-ai/glm-5.3-flash",
    systemPrompt: charPreset.systemPrompt,
    gender: "other",
    exampleDialogs: "",
    firstMessage: charPreset.firstMessage,
    firstMessageMode: "assistant",
    greetingVariants: charPreset.greetingVariants || [charPreset.firstMessage],
    traits: charPreset.tags || [],
    hiddenTraits: [],
    coreStates: charPreset.coreStates || [],
    lorebook: charPreset.lorebook || []
  };

  // Register core states
  if (!state.customStateStages[newId]) {
    state.customStateStages[newId] = {};
  }
  newCharacter.coreStates.forEach(cs => {
    state.customStateTypes[cs.key] = "number";
    state.customStateStages[newId][cs.key] = cs.stages;
  });
  saveCustomStateTypes(state.customStateTypes);
  saveCustomStateStages(state.customStateStages);

  // Initialize chat state
  const activeChatId = getActiveChatId(newId);
  if (activeChatId) {
    const chatStates = {};
    newCharacter.coreStates.forEach(cs => {
      chatStates[cs.key] = cs.defaultValue;
    });
    state.chatStates[activeChatId] = chatStates;
    saveChatStates(state.chatStates);
  }

  state.characters.push(newCharacter);
  saveCharacters(state.characters);
  renderCharacterList();
  switchActiveCharacter(newId);

  if (dom.characterCatalogDialog) dom.characterCatalogDialog.close();
  showStateNotification(`Персонаж «${newCharacter.name}» успешно добавлен в чат!`);
  setStatus(`Персонаж «${newCharacter.name}» добавлен в чат.`);
}

async function performChubSearch(query, page = 1, showSpinner = true) {
  if (!dom.chubCardsGrid) return;

  currentChubPage = Math.max(1, Number(page) || 1);
  if (typeof query === "string") {
    currentChubQuery = query;
  } else if (!currentChubQuery && dom.chubSearchInput) {
    currentChubQuery = dom.chubSearchInput.value || "fantasy";
  }

  if (showSpinner && dom.chubLoadingSpinner) {
    dom.chubLoadingSpinner.style.display = "flex";
  }
  if (dom.chubEmptyState) dom.chubEmptyState.style.display = "none";
  if (dom.chubErrorState) dom.chubErrorState.style.display = "none";
  if (dom.chubPaginationBar) dom.chubPaginationBar.style.display = "none";

  const sort = dom.chubSortSelect?.value || "star_count";
  const nsfw = dom.chubNsfwToggle?.checked || false;

  try {
    const result = await searchChub({
      search: currentChubQuery || "",
      page: currentChubPage,
      first: CHUB_PAGE_SIZE,
      sort: sort,
      nsfw: nsfw
    });

    lastChubResults = result.nodes || [];
    const totalCount = typeof result.count === "number" ? result.count : lastChubResults.length;
    totalChubPages = Math.max(1, Math.ceil(totalCount / CHUB_PAGE_SIZE));

    renderChubResults(lastChubResults);
    updateChubPaginationUI();

    // Scroll back to top smoothly on page change
    const scrollContainer = dom.chubCardsGrid.closest(".catalog-scroll-area");
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (err) {
    console.error("[ChubSearch] Failed:", err);
    if (dom.chubLoadingSpinner) dom.chubLoadingSpinner.style.display = "none";
    if (dom.chubPaginationBar) dom.chubPaginationBar.style.display = "none";
    if (dom.chubErrorState) {
      dom.chubErrorState.style.display = "flex";
      if (dom.chubErrorMessage) {
        dom.chubErrorMessage.textContent = `Ошибка поиска: ${err.message}. Проверьте соединение с интернетом или воспользуйтесь вкладкой «Рекомендуемые».`;
      }
    }
  } finally {
    if (dom.chubLoadingSpinner) dom.chubLoadingSpinner.style.display = "none";
  }
}

function updateChubPaginationUI() {
  if (!dom.chubPaginationBar) return;

  if (lastChubResults.length === 0 || totalChubPages <= 1) {
    dom.chubPaginationBar.style.display = "none";
    return;
  }

  dom.chubPaginationBar.style.display = "flex";
  if (dom.chubCurrentPageNum) dom.chubCurrentPageNum.textContent = currentChubPage;
  if (dom.chubTotalPagesNum) dom.chubTotalPagesNum.textContent = totalChubPages;
  if (dom.chubPrevPageBtn) dom.chubPrevPageBtn.disabled = currentChubPage <= 1;
  if (dom.chubNextPageBtn) dom.chubNextPageBtn.disabled = currentChubPage >= totalChubPages;
}

function renderChubResults(nodes) {
  if (!dom.chubCardsGrid) return;
  dom.chubCardsGrid.innerHTML = "";

  if (!nodes || nodes.length === 0) {
    if (dom.chubEmptyState) dom.chubEmptyState.style.display = "flex";
    return;
  }

  nodes.forEach(node => {
    const cardEl = document.createElement("div");
    cardEl.className = "catalog-card";

    const tagsHtml = (node.topics || []).slice(0, 3).map(t => `<span class="catalog-tag">${escapeHtml(t)}</span>`).join("");
    const avatarImg = node.avatarUrl
      ? `<img class="catalog-card-avatar" src="${node.avatarUrl}" alt="${escapeHtml(node.name)}" onerror="this.src='https://avatars.charhub.io/avatars/${node.fullPath}/avatar.webp'; this.onerror=null;" />`
      : `<div class="catalog-card-avatar-fallback">👤</div>`;

    cardEl.innerHTML = `
      <div class="catalog-card-header">
        ${avatarImg}
        <div class="catalog-card-identity">
          <div class="catalog-card-name-row">
            <h4 class="catalog-card-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</h4>
          </div>
          <div class="catalog-card-author">автор: ${escapeHtml(node.author || "Аноним")}</div>
        </div>
      </div>
      <p class="catalog-card-tagline">${escapeHtml(node.tagline || "Описание отсутствует")}</p>
      <div class="catalog-card-tags">${tagsHtml}</div>
      <div class="catalog-card-meta-row">
        <span class="catalog-card-meta-item">⭐ ${Number(node.starCount || 0).toLocaleString()}</span>
        <span class="catalog-card-meta-item">💬 ${Number(node.nChats || 0).toLocaleString()}</span>
        ${node.nTokens ? `<span class="catalog-card-meta-item">🔤 ${node.nTokens}t</span>` : ""}
      </div>
      <div class="catalog-card-footer">
        <button type="button" class="btn-card-asis" data-action="as-is" data-path="${node.fullPath}" title="Импортировать карточку в оригинале">
          <span>⚡ В чат</span>
        </button>
        <button type="button" class="btn-card-adapt" data-action="adapt" data-path="${node.fullPath}" title="Открыть диалог адаптации и перевода через ИИ">
          <span>🪄 Перевести</span>
        </button>
      </div>
    `;

    const asIsBtn = cardEl.querySelector('.btn-card-asis');
    const adaptBtn = cardEl.querySelector('.btn-card-adapt');

    if (asIsBtn) {
      asIsBtn.addEventListener("click", () => handleChubCardAction(node.fullPath, "as-is"));
    }
    if (adaptBtn) {
      adaptBtn.addEventListener("click", () => handleChubCardAction(node.fullPath, "adapt"));
    }

    dom.chubCardsGrid.appendChild(cardEl);
  });
}

async function handleChubCardAction(fullPath, mode) {
  if (!fullPath) return;

  setStatus(`Загрузка карточки «${fullPath}» с Chub AI...`);
  showStateNotification(`Загружаем карточку с Chub AI...`);

  try {
    const details = await fetchChubCharacterDetails(fullPath);
    const rawCard = convertChubToRawCard(details);
    currentImportingCard = rawCard;

    if (mode === "as-is") {
      executeDirectCharacterCreation(rawCard);
    } else {
      if (dom.characterCatalogDialog) dom.characterCatalogDialog.close();
      openCardImportDialog(rawCard);
    }
  } catch (err) {
    console.error("[ChubImport] Failed to fetch card:", err);
    alert(`Не удалось загрузить карточку с Chub: ${err.message}`);
    showStateNotification(`Ошибка загрузки карточки: ${err.message}`);
  }
}

function executeDirectCharacterCreation(rawCard) {
  if (!rawCard) return;

  const newId = `char_${Date.now()}`;
  const greetings = rawCard.alternateGreetings && rawCard.alternateGreetings.length > 0
    ? [rawCard.firstMessage, ...rawCard.alternateGreetings.slice(0, 2)]
    : [rawCard.firstMessage];

  const newChar = {
    id: newId,
    name: rawCard.name || "Персонаж Chub",
    personality: rawCard.personality || rawCard.description || "Без описания",
    appearance: "",
    behavior: rawCard.personality || "",
    backstory: rawCard.description || "",
    speech: "",
    imagePrompt: "",
    avatarUrl: rawCard.avatarUrl || "",
    scenario: rawCard.scenario || "Знакомство с персонажем.",
    description: rawCard.description || "",
    model: state.apiSettings?.model || "z-ai/glm-5.3-flash",
    systemPrompt: rawCard.systemPrompt || "",
    gender: "other",
    exampleDialogs: rawCard.exampleDialogs || "",
    firstMessage: rawCard.firstMessage || "Приветствую!",
    firstMessageMode: "assistant",
    greetingVariants: greetings.filter(Boolean),
    traits: rawCard.tags || [],
    hiddenTraits: [],
    coreStates: [
      {
        key: "trust",
        displayName: "Доверие",
        defaultValue: 20,
        color: "#ffffff",
        stages: [
          "Осторожность и недоверие.",
          "Формальный контакт.",
          "Сдержанная симпатия.",
          "Дружеское доверие.",
          "Глубокая привязанность.",
          "Абсолютное доверие."
        ]
      },
      {
        key: "mood",
        displayName: "Настроение",
        defaultValue: 50,
        color: "#ffffff",
        stages: [
          "Подавленность или раздражение.",
          "Легкое беспокойство.",
          "Спокойствие и нейтралитет.",
          "Позитивный настрой.",
          "Воодушевление и радость.",
          "Полный восторг!"
        ]
      }
    ],
    lorebook: rawCard.lorebook || []
  };

  // Register default custom states
  if (!state.customStateStages[newId]) {
    state.customStateStages[newId] = {};
  }
  newChar.coreStates.forEach(cs => {
    state.customStateTypes[cs.key] = "number";
    state.customStateStages[newId][cs.key] = cs.stages;
  });
  saveCustomStateTypes(state.customStateTypes);
  saveCustomStateStages(state.customStateStages);

  const activeChatId = getActiveChatId(newId);
  if (activeChatId) {
    const chatStates = {};
    newChar.coreStates.forEach(cs => {
      chatStates[cs.key] = cs.defaultValue;
    });
    state.chatStates[activeChatId] = chatStates;
    saveChatStates(state.chatStates);
  }

  state.characters.push(newChar);
  saveCharacters(state.characters);
  renderCharacterList();
  switchActiveCharacter(newId);

  if (dom.characterCatalogDialog) dom.characterCatalogDialog.close();
  if (dom.cardImportDialog) dom.cardImportDialog.close();

  showStateNotification(`Персонаж «${newChar.name}» успешно добавлен в чат!`);
  setStatus(`Персонаж «${newChar.name}» импортирован как есть.`);
}

async function handleChubUrlDownload() {
  const urlVal = dom.chubUrlInput?.value || "";
  const statusEl = dom.chubUrlStatus;

  if (!urlVal.trim()) {
    if (statusEl) {
      statusEl.className = "chub-url-status error";
      statusEl.textContent = "Пожалуйста, введите ссылку на персонажа.";
      statusEl.style.display = "block";
    }
    return;
  }

  const fullPath = parseChubUrl(urlVal);
  if (!fullPath) {
    if (statusEl) {
      statusEl.className = "chub-url-status error";
      statusEl.textContent = "Не удалось распознать ссылку. Убедитесь, что она ведет на chub.ai/characters/автор/имя.";
      statusEl.style.display = "block";
    }
    return;
  }

  if (statusEl) {
    statusEl.className = "chub-url-status loading";
    statusEl.textContent = `Загружаем данные персонажа «${fullPath}»...`;
    statusEl.style.display = "block";
  }

  try {
    const details = await fetchChubCharacterDetails(fullPath);
    const rawCard = convertChubToRawCard(details);
    currentImportingCard = rawCard;

    if (statusEl) {
      statusEl.className = "chub-url-status success";
      statusEl.textContent = `Карточка «${rawCard.name}» успешно получена!`;
    }

    if (dom.characterCatalogDialog) dom.characterCatalogDialog.close();
    openCardImportDialog(rawCard);
  } catch (err) {
    console.error("[ChubUrl] Download error:", err);
    if (statusEl) {
      statusEl.className = "chub-url-status error";
      statusEl.textContent = `Ошибка скачивания: ${err.message}`;
    }
  }
}

// --- AI Character Enhancer & Audit System (with 18+ Mode) ---

let currentEnhancingCharacter = null;
let currentEnhancedResult = null;

function openCharacterEnhancerDialog(charData) {
  if (!dom.characterEnhancerDialog) return;
  if (!charData) {
    alert("Персонаж не выбран для улучшения.");
    return;
  }

  currentEnhancingCharacter = { ...charData };
  currentEnhancedResult = null;

  // Render hero banner
  if (dom.enhancerCharName) {
    dom.enhancerCharName.textContent = charData.name || "Персонаж без имени";
  }
  if (dom.enhancerCharDesc) {
    dom.enhancerCharDesc.textContent = charData.description || charData.behavior || charData.personality || "Нет описания";
  }
  if (dom.enhancerAvatarPreview) {
    const avatar = charData.avatarUrl || charData.avatar || charData.image || "";
    if (avatar) {
      dom.enhancerAvatarPreview.style.backgroundImage = `url("${avatar}")`;
      dom.enhancerAvatarPreview.textContent = "";
    } else {
      dom.enhancerAvatarPreview.style.backgroundImage = "";
      dom.enhancerAvatarPreview.textContent = "👤";
    }
  }

  // Populate models
  renderModelOptions();

  // Reset controls
  if (dom.enhancerNsfwToggle) {
    dom.enhancerNsfwToggle.checked = false;
  }
  if (dom.enhancerNsfwBadge) {
    dom.enhancerNsfwBadge.style.display = "none";
  }
  if (dom.enhancerPresetSelect) {
    dom.enhancerPresetSelect.value = "balanced";
  }
  if (dom.enhancerUserInstructions) {
    dom.enhancerUserInstructions.value = "";
  }
  if (dom.enhancerProgress) {
    dom.enhancerProgress.style.display = "none";
  }
  if (dom.enhancerError) {
    dom.enhancerError.style.display = "none";
  }
  if (dom.enhancerResultSection) {
    dom.enhancerResultSection.style.display = "none";
  }
  if (dom.enhancerSubmitBtn) {
    dom.enhancerSubmitBtn.disabled = false;
  }

  dom.characterEnhancerDialog.showModal();
}

async function executeCharacterEnhancement() {
  if (!currentEnhancingCharacter) return;

  const isNsfw = Boolean(dom.enhancerNsfwToggle?.checked);
  const stylePreset = dom.enhancerPresetSelect?.value || "balanced";
  const customInstructions = dom.enhancerUserInstructions?.value || "";
  const model = dom.enhancerModelSelect?.value || dom.wizardModelSelect?.value;

  if (dom.enhancerProgress) {
    dom.enhancerProgress.style.display = "flex";
    if (dom.enhancerProgressText) {
      dom.enhancerProgressText.textContent = isNsfw
        ? "🔞 ИИ анализирует персонажа и готовит улучшение (режим 18+)..."
        : "✨ ИИ анализирует характер, речь и слабые места персонажа...";
    }
  }
  if (dom.enhancerError) dom.enhancerError.style.display = "none";
  if (dom.enhancerSubmitBtn) dom.enhancerSubmitBtn.disabled = true;
  if (dom.enhancerResultSection) dom.enhancerResultSection.style.display = "none";

  try {
    const enhanced = await analyzeAndEnhanceCharacter(
      currentEnhancingCharacter,
      { isNsfw, stylePreset, customInstructions, model },
      (statusText) => {
        if (dom.enhancerProgressText) dom.enhancerProgressText.textContent = statusText;
      }
    );

    currentEnhancedResult = enhanced;

    // Render Audit Information
    if (dom.enhancerAuditSummary) {
      dom.enhancerAuditSummary.textContent = enhanced.audit?.summary || "Анализ и улучшение успешно завершены.";
    }

    if (dom.enhancerAuditWeaknesses) {
      dom.enhancerAuditWeaknesses.innerHTML = "";
      const weaknesses = enhanced.audit?.weaknesses || ["Недостаточно подробная проработка контекста"];
      weaknesses.forEach(w => {
        const li = document.createElement("li");
        li.textContent = w;
        dom.enhancerAuditWeaknesses.appendChild(li);
      });
    }

    if (dom.enhancerAuditImprovements) {
      dom.enhancerAuditImprovements.innerHTML = "";
      const improvements = enhanced.audit?.improvements || ["Углублен характер, добавлены живые детали и прописаны шкалы"];
      improvements.forEach(imp => {
        const li = document.createElement("li");
        li.textContent = imp;
        dom.enhancerAuditImprovements.appendChild(li);
      });
    }

    // Render Preview Fields
    if (dom.enhancerPreviewFirstMessage) {
      dom.enhancerPreviewFirstMessage.textContent = enhanced.firstMessage || "(Не задано)";
    }
    if (dom.enhancerPreviewAppearance) {
      dom.enhancerPreviewAppearance.textContent = enhanced.appearance || "(Не задано)";
    }
    if (dom.enhancerPreviewBehavior) {
      dom.enhancerPreviewBehavior.textContent = enhanced.behavior || "(Не задано)";
    }
    if (dom.enhancerPreviewSpeech) {
      dom.enhancerPreviewSpeech.textContent = enhanced.speech || "(Не задано)";
    }
    if (dom.enhancerPreviewScenario) {
      dom.enhancerPreviewScenario.textContent = enhanced.scenario || "(Не задано)";
    }

    // Render Core States Preview
    if (dom.enhancerPreviewCoreStates) {
      dom.enhancerPreviewCoreStates.innerHTML = "";
      if (Array.isArray(enhanced.coreStates) && enhanced.coreStates.length > 0) {
        enhanced.coreStates.forEach(cs => {
          const card = document.createElement("div");
          card.className = "enhancer-state-card";
          card.style.borderLeft = `4px solid ${cs.color || '#ffffff'}`;
          
          const header = document.createElement("div");
          header.className = "enhancer-state-card-header";
          header.innerHTML = `
            <span style="color: ${cs.color || '#ffffff'}; font-weight: 700;">${escapeHtml(cs.displayName)}</span>
            <span style="font-size: 11px; color: #a1a1aa;">(${escapeHtml(cs.key)}) · старт: ${cs.defaultValue}</span>
          `;
          card.appendChild(header);

          const stagesGrid = document.createElement("div");
          stagesGrid.className = "enhancer-state-stages";
          (cs.stages || []).forEach((stageDesc, sIdx) => {
            const stageEl = document.createElement("div");
            stageEl.style.background = "rgba(255,255,255,0.03)";
            stageEl.style.padding = "4px 6px";
            stageEl.style.borderRadius = "4px";
            stageEl.innerHTML = `<strong style="color: #d4d4d8;">[${sIdx}]:</strong> ${escapeHtml(stageDesc)}`;
            stagesGrid.appendChild(stageEl);
          });
          card.appendChild(stagesGrid);

          dom.enhancerPreviewCoreStates.appendChild(card);
        });
      } else {
        dom.enhancerPreviewCoreStates.innerHTML = "<p style='color: #a1a1aa; margin: 0;'>Шкалы состояний не изменились.</p>";
      }
    }

    if (dom.enhancerResultSection) {
      dom.enhancerResultSection.style.display = "flex";
      dom.enhancerResultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    setStatus(`Character "${enhanced.name}" enhanced by AI.`);
  } catch (err) {
    console.error("[CharacterEnhancer] Error:", err);
    if (dom.enhancerError) {
      dom.enhancerError.textContent = `Ошибка анализа и генерации: ${err.message}`;
      dom.enhancerError.style.display = "block";
    }
  } finally {
    if (dom.enhancerProgress) dom.enhancerProgress.style.display = "none";
    if (dom.enhancerSubmitBtn) dom.enhancerSubmitBtn.disabled = false;
  }
}

function applyCharacterEnhancements() {
  if (!currentEnhancedResult) return;

  const targetId = currentEnhancedResult.id || (currentEnhancingCharacter ? currentEnhancingCharacter.id : null);
  if (!targetId) return;

  // 1. Update state.characters array
  const charIdx = state.characters.findIndex(c => c.id === targetId);
  if (charIdx >= 0) {
    state.characters[charIdx] = {
      ...state.characters[charIdx],
      appearance: currentEnhancedResult.appearance,
      behavior: currentEnhancedResult.behavior,
      backstory: currentEnhancedResult.backstory,
      speech: currentEnhancedResult.speech,
      personality: currentEnhancedResult.personality,
      scenario: currentEnhancedResult.scenario,
      description: currentEnhancedResult.description,
      firstMessage: currentEnhancedResult.firstMessage || state.characters[charIdx].firstMessage,
      traits: currentEnhancedResult.traits || state.characters[charIdx].traits,
      hiddenTraits: currentEnhancedResult.hiddenTraits || state.characters[charIdx].hiddenTraits,
      coreStates: (currentEnhancedResult.coreStates && currentEnhancedResult.coreStates.length > 0)
        ? currentEnhancedResult.coreStates
        : state.characters[charIdx].coreStates
    };
    saveCharacters(state.characters);
  }

  // 2. Register core state stages
  if (currentEnhancedResult.coreStates && currentEnhancedResult.coreStates.length > 0) {
    if (!state.customStateStages[targetId]) {
      state.customStateStages[targetId] = {};
    }
    currentEnhancedResult.coreStates.forEach(cs => {
      state.customStateTypes[cs.key] = "number";
      state.customStateStages[targetId][cs.key] = cs.stages;
    });
    saveCustomStateTypes(state.customStateTypes);
    saveCustomStateStages(state.customStateStages);

    // Initialize chat states if chat already exists
    const activeChatId = getActiveChatId(targetId);
    if (activeChatId) {
      const chatStates = { ...state.chatStates[activeChatId] };
      let updated = false;
      currentEnhancedResult.coreStates.forEach(cs => {
        if (chatStates[cs.key] === undefined) {
          chatStates[cs.key] = cs.defaultValue;
          updated = true;
        }
      });
      if (updated) {
        state.chatStates[activeChatId] = chatStates;
        saveChatStates(state.chatStates);
      }
    }
  }

  // 3. Update character form in admin modal if open or editing this character
  if (dom.characterId && (dom.characterId.value === targetId || !dom.characterId.value)) {
    if (!dom.characterId.value) dom.characterId.value = targetId;
    if (dom.characterName && currentEnhancedResult.name) dom.characterName.value = currentEnhancedResult.name;
    if (dom.characterGender && currentEnhancedResult.gender) dom.characterGender.value = currentEnhancedResult.gender;
    if (dom.characterAppearance) dom.characterAppearance.value = currentEnhancedResult.appearance || "";
    if (dom.characterBehavior) dom.characterBehavior.value = currentEnhancedResult.behavior || "";
    if (dom.characterBackstory) dom.characterBackstory.value = currentEnhancedResult.backstory || "";
    if (dom.characterSpeech) dom.characterSpeech.value = currentEnhancedResult.speech || "";
    if (dom.characterPersonality) dom.characterPersonality.value = currentEnhancedResult.personality || "";
    if (dom.characterScenario) dom.characterScenario.value = currentEnhancedResult.scenario || "";
    if (dom.characterDescription) dom.characterDescription.value = currentEnhancedResult.description || "";
    if (dom.characterFirstMessage) dom.characterFirstMessage.value = currentEnhancedResult.firstMessage || "";
    if (dom.characterTraits) dom.characterTraits.value = (currentEnhancedResult.traits || []).join(", ");
    if (dom.characterHiddenTraits) dom.characterHiddenTraits.value = (currentEnhancedResult.hiddenTraits || []).join(", ");

    if (currentEnhancedResult.coreStates && currentEnhancedResult.coreStates.length > 0) {
      renderCoreStatesEditorList(currentEnhancedResult);
    }
  }

  // 4. Close dialog and notify
  if (dom.characterEnhancerDialog) dom.characterEnhancerDialog.close();

  // If this character is active in chat, re-render chat header and directives
  if (state.activeCharacterId === targetId) {
    renderMessages();
    renderDirectivesBar();
  }

  renderCharacters();
  showStateNotification(`Персонаж «${currentEnhancedResult.name}» успешно обновлен улучшенной версией!`);
  setStatus(`Character "${currentEnhancedResult.name}" updated with enhancements.`);
}

// --- Character Creator Dialog ---

function openAdminDialog() {
  if (state.characters.length) {
    selectAdminCharacter(state.characters[0].id);
  } else {
    startCharacterWizard();
  }
  dom.adminDialog.showModal();
}

function upsertCharacterFromForm() {
  console.log("Upsert started");
  
  const coreStates = [];
  const cards = document.querySelectorAll(".core-state-editor-card");
  cards.forEach(card => {
    const keyInput = card.querySelector(".core-state-key");
    const displayInput = card.querySelector(".core-state-display-name");
    
    if (!keyInput || !displayInput) return;
    
    const key = keyInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const displayName = displayInput.value.trim();
    const defaultValue = Number(card.querySelector(".core-state-default").value) || 20;
    const color = card.querySelector(".core-state-color").value;
    const stages = [];
    for (let i = 0; i < 6; i++) {
      stages.push(card.querySelector(`.core-state-stage-${i}`).value.trim());
    }
    if (key && displayName) {
      coreStates.push({ key, displayName, defaultValue, color, stages });
    }
  });

  // Load LoreBook entries
  const lorebook = [];
  const loreCards = document.querySelectorAll("#loreBookList .core-state-editor-card");
  loreCards.forEach(card => {
    const keysInput = card.querySelector(".lore-entry-keys");
    const contentTextarea = card.querySelector(".lore-entry-content");
    const enabledCheckbox = card.querySelector(".lore-entry-enabled");
    
    if (!keysInput || !contentTextarea) return;
    
    const keys = keysInput.value.trim();
    const content = contentTextarea.value.trim();
    const enabled = enabledCheckbox.checked;
    
    if (keys && content) {
      lorebook.push({ keys, content, enabled });
    }
  });

  const appearance = dom.characterAppearance.value.trim();
  const behavior = dom.characterBehavior.value.trim();
  const backstory = dom.characterBackstory.value.trim();
  const speech = dom.characterSpeech.value.trim();

  // Compile detailed properties into monolithic personality field for backwards-compatibility & prompt builder
  let compiledPersonality = "";
  if (appearance) compiledPersonality += `[Внешность]: ${appearance}\n`;
  if (behavior) compiledPersonality += `[Характер и поведение]: ${behavior}\n`;
  if (backstory) compiledPersonality += `[Предыстория]: ${backstory}\n`;
  if (speech) compiledPersonality += `[Стиль общения]: ${speech}\n`;
  compiledPersonality = compiledPersonality.trim() || behavior;

  const payload = {
    id: dom.characterId.value || `char_${Date.now()}`,
    name: dom.characterName.value.trim(),
    personality: compiledPersonality,
    appearance: appearance,
    behavior: behavior,
    backstory: backstory,
    speech: speech,
    imagePrompt: dom.characterImagePrompt ? dom.characterImagePrompt.value.trim() : "",
    avatarUrl: dom.characterAvatarUrl ? dom.characterAvatarUrl.value.trim() : "",
    scenario: dom.characterScenario.value.trim(),
    description: dom.characterDescription.value.trim(),
    model: dom.characterModelSelect ? dom.characterModelSelect.value : (state.characters.find(c => c.id === dom.characterId.value)?.model || ""),
    systemPrompt: dom.characterPrompt.value.trim(),
    gender: dom.characterGender.value,
    exampleDialogs: dom.characterExampleDialogs.value.trim(),
    firstMessage: (dom.characterFirstMessage ? dom.characterFirstMessage.value.trim() : "") || state.characters.find(c => c.id === dom.characterId.value)?.firstMessage || "",
    firstMessageMode: dom.characterFirstMessageMode ? dom.characterFirstMessageMode.value : "assistant",
    traits: dom.characterTraits.value ? dom.characterTraits.value.split(",").map((t) => t.trim()).filter((t) => t.length > 0) : [],
    hiddenTraits: (dom.characterHiddenTraits && dom.characterHiddenTraits.value) ? dom.characterHiddenTraits.value.split(",").map((t) => t.trim()).filter((t) => t.length > 0) : (state.characters.find(c => c.id === dom.characterId.value)?.hiddenTraits || []),
    coreStates: coreStates,
    lorebook: lorebook
  };

  console.log("Payload:", payload);

  if (!payload.name || !payload.personality || !payload.scenario) {
    dom.adminFeedback.textContent = "Name, Personality, and Scenario are required.";
    console.warn("Validation failed");
    return;
  }

  if (!state.customStateStages[payload.id]) {
    state.customStateStages[payload.id] = {};
  }
  payload.coreStates.forEach(cs => {
    state.customStateTypes[cs.key] = "number";
    state.customStateStages[payload.id][cs.key] = cs.stages;
  });
  saveCustomStateTypes(state.customStateTypes);
  saveCustomStateStages(state.customStateStages);

  const activeChatId = getActiveChatId(payload.id);
  if (activeChatId) {
    const chatStates = { ...state.chatStates[activeChatId] };
    let updated = false;
    payload.coreStates.forEach(cs => {
      if (chatStates[cs.key] === undefined) {
        chatStates[cs.key] = cs.defaultValue;
        updated = true;
      }
      if (!state.customStateStages[payload.id]) {
        state.customStateStages[payload.id] = {};
      }
      state.customStateStages[payload.id][cs.key] = cs.stages;
    });
    if (updated) {
      state.chatStates[activeChatId] = chatStates;
      saveChatStates(state.chatStates);
    }
  }

  const idx = state.characters.findIndex((c) => c.id === payload.id);
  console.log("Index found:", idx);

  if (idx >= 0) {
    state.characters[idx] = payload;
    dom.adminFeedback.textContent = "Character updated.";
  } else {
    state.characters.push(payload);
    dom.adminFeedback.textContent = "Character created.";
  }

  saveCharacters(state.characters);
  console.log("Characters saved. Current list:", state.characters);

  switchActiveCharacter(payload.id);
  selectAdminCharacter(payload.id);
  
  dom.adminDialog.close();
}

function deleteSelectedCharacter() {
  const id = dom.characterId.value;
  if (!id) return;
  if (state.characters.length <= 1) {
    dom.adminFeedback.textContent = "At least one character must remain.";
    return;
  }

  state.characters = state.characters.filter((c) => c.id !== id);
  deleteAllChatsForCharacter(id);
  saveCharacters(state.characters);
  ensureActiveCharacter();
  switchActiveCharacter(state.activeCharacterId);
  selectAdminCharacter(state.characters[0].id);
  dom.adminFeedback.textContent = "Character deleted.";
}

function deleteAllChatsForCharacter(characterId) {
  const chats = state.chatMetadata[characterId] || [];
  chats.forEach((chat) => {
    delete state.chats[chat.id];
    delete state.chatStates[chat.id];
    delete state.chatSummaries[chat.id];
    delete state.chatSummarizedMessageCount[chat.id];
  });
  delete state.chatMetadata[characterId];
  saveChats(state.chats);
  saveChatStates(state.chatStates);
  saveChatMetadata(state.chatMetadata);
  saveChatSummaries(state.chatSummaries);
  saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
}

// --- SSE parser & SSE helper ---
function stripPartnerVoice(text, partnerName) {
  if (!text || !partnerName) return text;
  let thought = "";
  let body = text;
  const startMatch = text.match(/<thought\s*>/i);
  if (startMatch) {
    const endRe = /<\/thought\s*>/i;
    const endMatch = endRe.exec(text);
    if (endMatch && endMatch.index > startMatch.index) {
      thought = text.slice(startMatch.index, endMatch.index + endMatch[0].length);
      body = text.slice(endMatch.index + endMatch[0].length);
    }
  }
  const name = partnerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    "(^|\\n)[ \\t>]*(?:【" + name + "】[ \\t]*:|" + name + "[ \\t]*:)[^\\n]*",
    "gi"
  );
  body = body.replace(re, "");
  body = body.replace(/^[ \t\r\n]+/, "");
  return thought + body;
}

// --- State Proposals Parsing ---
function extractCompleteJsonObjects(str) {
  str = str.trim();
  if (str.startsWith("[")) {
    str = str.slice(1).trim();
  }
  if (str.endsWith("]")) {
    str = str.slice(0, -1).trim();
  }

  const results = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escape) { escape = false; continue; }
    if (char === '\\' && inString) { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const objStr = str.slice(objStart, i + 1);
        try {
          const obj = JSON.parse(objStr);
          results.push(obj);
        } catch (_) {}
        objStart = -1;
      }
    }
  }

  return results;
}

function parseStateProposals(rawText) {
  const stateMatch = rawText.match(/```state_updates\s*([\s\S]*?)(?:```|$)/i);
  const stageMatch = rawText.match(/```stage_update\s*([\s\S]*?)(?:```|$)/i);

  let proposals = [];
  let cleanedText = rawText.trim();

  if (stateMatch) {
    cleanedText = cleanedText.replace(stateMatch[0], "").trim();
    try {
      let jsonText = stateMatch[1].trim();
      jsonText = jsonText
        .replace(/(:\s*)\+(\d+)/g, "$1$2")
        .replace(/(,\s*)\+(\d+)/g, "$1$2")
        .replace(/(\[\s*)\+(\d+)/g, "$1$2");

      let parsed = null;
      try {
        parsed = JSON.parse(jsonText);
      } catch (_) {
        parsed = extractCompleteJsonObjects(jsonText);
      }
        
      if (Array.isArray(parsed)) {
        proposals = parsed
          .filter((item) => item && item.key && item.value !== undefined)
          .map((item) => ({
            key: String(item.key).trim(),
            value: item.value,
            type: item.type ? String(item.type).trim() : null,
            reason: item.reason ? String(item.reason).trim() : ""
          }))
          .filter((item) => item.key);
      }
    } catch (e) {
      console.warn("Failed to parse state updates JSON:", e.message);
    }
  }

  let stageUpdate = null;
  if (stageMatch) {
    cleanedText = cleanedText.replace(stageMatch[0], "").trim();
    try {
      const jsonText = stageMatch[1].trim();
      const parsed = JSON.parse(jsonText);
      if (parsed && parsed.stage) {
        stageUpdate = {
          stage: String(parsed.stage).trim(),
          description: parsed.description ? String(parsed.description).trim() : ""
        };
      }
    } catch (e) {
      console.warn("Failed to parse stage update:", e.message);
    }
  }

  return { cleanedText, proposals, stageUpdate };
}

// --- Load models list ---
async function loadModels({ silent = false } = {}) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  const provider = state.apiSettings.apiProvider || "openrouter";
  const isOpenRouter = provider === "openrouter";
  const isNordrouter = provider === "nordrouter";

  if (!isOpenRouter && !isNordrouter && apiConfig.baseUrl === null && !apiConfig.apiKey) {
    if (!silent) setApiStatus("Paste API key to load models.");
    renderModelOptions();
    return;
  }

  if (isNordrouter && !apiConfig.apiKey) {
    if (!silent) setApiStatus("Введите API ключ NordRouter для загрузки моделей.");
    renderModelOptions();
    return;
  }

  if (dom.refreshModelsBtn) dom.refreshModelsBtn.disabled = true;
  if (!silent) setApiStatus("Loading models...");
  try {
    const modelObjects = await fetchModels({ apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, provider: state.apiSettings.apiProvider });
    if (!modelObjects.length) {
      if (!silent) setApiStatus("No models returned by API. Keeping existing options.");
      return;
    }
    const models = modelObjects.map(m => typeof m === 'string' ? m : m.id);
    state.models = models;
    saveModelsCache(models);

    // Merge detailed metadata with existing cache
    const metadata = { ...(state.modelsMetadata || {}) };
    modelObjects.forEach(m => {
      if (m && typeof m === 'object' && m.id) {
        metadata[m.id] = {
          name: m.name || m.id,
          context_length: m.context_length || 0,
          pricing: m.pricing || { prompt: "0", completion: "0" }
        };
      }
    });
    state.modelsMetadata = metadata;
    saveModelsMetadataCache(metadata);

    if (!state.models.includes(state.apiSettings.selectedModel) && state.models.length > 0) {
      state.apiSettings.selectedModel = state.models[0];
      saveApiSettings(state.apiSettings);
    }
    renderModelOptions();
    updateStatsUI();
    if (!silent) setApiStatus(`Loaded ${models.length} models.`);
  } catch (error) {
    const isLocal = provider === "local";
    const errorMsg = (isLocal || isNordrouter) ? (error.message || "Ошибка подключения") : mapOpenRouterError(error);
    if (!silent) setApiStatus(`Model loading failed: ${errorMsg}`);
    renderModelOptions();
  } finally {
    if (dom.refreshModelsBtn) dom.refreshModelsBtn.disabled = false;
  }
}

// --- Apply proposals automatically ---
function autoApplyStateProposals(character, activeChatId, proposals) {
  if (!proposals || !proposals.length) return [];
  
  const charId = character.id;
  const currentStates = { ...getChatStates(activeChatId) };
  let hasChanges = false;
  let typesChanged = false;
  const appliedChanges = [];
  
  proposals.forEach((proposal) => {
    if (!proposal.key) return;
    const key = String(proposal.key).trim();
    const originalValue = currentStates[key];
    
    const proposedType = proposal.type ? String(proposal.type).trim() : null;
    let type = getStateType(key, state.customStateTypes);
    
    if (proposedType && !isBuiltinState(key) && ["number", "string", "boolean"].includes(proposedType)) {
      if (type === "string" && proposedType !== "string") {
        state.customStateTypes = { ...state.customStateTypes, [key]: proposedType };
        type = proposedType;
        typesChanged = true;
        console.log(`[States] Registering new custom state type: ${key} = ${proposedType}`);
      } else if (!state.customStateTypes[key]) {
        state.customStateTypes = { ...state.customStateTypes, [key]: proposedType };
        type = proposedType;
        typesChanged = true;
      }
    }

    const isNew = originalValue === undefined;
    if (isNew && !isBuiltinState(key)) {
      const customStatesCount = Object.keys(currentStates).filter(k => !isBuiltinState(k) && k !== "eventLog" && k !== "statusConditions").length;
      if (customStatesCount >= 3) {
        console.log(`[States] Custom state limit (3) reached, ignoring proposal to create new state: ${key}`);
        return;
      }
    }
    
    let newValue;
    if (type === "number") {
      const isNew = originalValue === undefined;
      const rawVal = Number(proposal.value);
      if (isNaN(rawVal)) {
        console.warn(`[States] Non-numeric value for ${key}: "${proposal.value}", skipping.`);
        return;
      }

      if (isNew) {
        // Initialize new state directly to the starting value suggested by LLM, clamped to [0, 100]
        newValue = Math.min(100, Math.max(0, rawVal));
        console.log(`[States] ${key} initialized as new state with value: ${newValue}`);
      } else {
        // Existing state: update as delta
        let scaledDelta = rawVal;
        if (rawVal !== 0) {
          // Clamp change between -6 and 6, matching duo mode
          scaledDelta = Math.min(6, Math.max(-6, rawVal));
        }

        const modified = modifyValueByTraits(character, key, scaledDelta);
        const modifiedDelta = typeof modified.value === "number" ? modified.value : scaledDelta;
        newValue = originalValue + modifiedDelta;
        console.log(`[States] ${key}: ${originalValue} + ${modifiedDelta} (delta, raw: ${rawVal}) = ${newValue}`);
      }
    } else if (type === "boolean") {
      newValue = proposal.value === true || proposal.value === "true";
    } else {
      newValue = proposal.value;
    }
    
    const normalized = normalizeStateValue(type, newValue, key);
    
    if (isNew || normalized !== originalValue) {
      currentStates[key] = normalized;
      hasChanges = true;

      if (type === "number" && !isBuiltinState(key)) {
        triggerStageGeneration(character, key);
      }

      pushAction(
        "state_add", 
        { characterId: activeChatId, key, value: normalized, oldValue: originalValue }, 
        { action: "state_delete" }
      );

      const diff = typeof normalized === 'number' && typeof originalValue === 'number' ? normalized - originalValue : 0;
      let logMsg = "";
      let toastMsg = "";
      
      if (isNew) {
        logMsg = `NEW STATE "${key}" (${type}): ${normalized}`;
        toastMsg = `✨ New: ${key} = ${normalized}`;
      } else if (key === "relationshipStage") {
        logMsg = `STAGE changed from "${originalValue || "Stranger"}" to "${normalized}"`;
        toastMsg = `💫 Relationship Stage: ${normalized}`;
      } else if (typeof normalized === 'number') {
        const sign = diff >= 0 ? "+" : "";
        logMsg = `${key.toUpperCase()} updated: ${sign}${diff} (New: ${normalized})`;
        toastMsg = `${key.toUpperCase()} ${sign}${diff} → ${normalized}%`;
      } else {
        logMsg = `${key.toUpperCase()} changed from "${originalValue}" to "${normalized}"`;
        toastMsg = `${key.toUpperCase()}: ${normalized}`;
      }
      
      if (proposal.reason) {
        logMsg += ` | Reason: ${proposal.reason}`;
        toastMsg += ` — ${proposal.reason}`;
      }
      
      appliedChanges.push({
        key,
        name: (character?.coreStates && character.coreStates.find(cs => cs.key === key)?.displayName) || key,
        oldVal: originalValue !== undefined ? originalValue : null,
        newVal: normalized,
        diff: typeof normalized === 'number' && typeof originalValue === 'number' ? normalized - originalValue : null,
        isNew,
        type
      });

      addEventLogEntry(activeChatId, logMsg);
      showStateNotification(toastMsg);
    } else {
      console.log(`[States] ${key} unchanged.`);
    }
  });
  
  if (typesChanged) {
    saveCustomStateTypes(state.customStateTypes);
  }
  
  if (hasChanges) {
    state.chatStates[activeChatId] = currentStates;
    saveChatStates(state.chatStates);
    renderStates();
    renderProgressBar();
    renderMoodIndicator();
  }
  return appliedChanges;
}

// --- Event Handlers & Chat Logic ---

const EMOJI_CATEGORIES = [
  {
    name: "Эмоции & Смайлы",
    emojis: ["😊", "😄", "😃", "😁", "😆", "😂", "🤣", "😉", "😏", "😍", "🥰", "😘", "😜", "😝", "😎", "😇", "🥳", "🤩", "😳", "🥺", "😭", "😱", "😡", "😈", "😴", "🤔", "🧐"]
  },
  {
    name: "Жесты & Реакции",
    emojis: ["👍", "👎", "✌️", "🤞", "🤙", "👏", "🙌", "👐", "🤝", "🤛", "🤜", "👊", "👉", "👈", "👆", "👇", "🖐️", "✋", "👋", "✍️", "🙏"]
  },
  {
    name: "Чувства & Символы",
    emojis: ["❤️", "💖", "💗", "💓", "💞", "💘", "💔", "🖤", "🤍", "💜", "💙", "💚", "💛", "🧡", "❣️", "🔥", "✨", "💫", "⭐", "⚡", "💥", "🎉", "🎁"]
  },
  {
    name: "Персонажи & Предметы",
    emojis: ["👑", "🎩", "🎓", "🕶️", "🎒", "🌹", "🌸", "🌺", "🍀", "🌙", "☀️", "🐾", "🐱", "🐶", "🦊", "🦄", "🎮", "🎲", "🎨", "🎭", "☕", "🍷", "🍕"]
  }
];

function insertEmojiIntoInput(emoji) {
  if (!dom.messageInput) return;
  const input = dom.messageInput;
  const start = input.selectionStart !== null && input.selectionStart !== undefined ? input.selectionStart : input.value.length;
  const end = input.selectionEnd !== null && input.selectionEnd !== undefined ? input.selectionEnd : input.value.length;
  const val = input.value;
  input.value = val.substring(0, start) + emoji + val.substring(end);
  const newPos = start + emoji.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
}

function initEmojiPicker() {
  if (!dom.emojiPickerPanel || !dom.emojiPickerBtn) return;

  dom.emojiPickerPanel.innerHTML = "";
  EMOJI_CATEGORIES.forEach(cat => {
    const catDiv = document.createElement("div");
    catDiv.className = "emoji-category";

    const title = document.createElement("div");
    title.className = "emoji-category-title";
    title.textContent = cat.name;
    catDiv.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "emoji-grid";

    cat.emojis.forEach(e => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-item-btn";
      btn.textContent = e;
      btn.title = e;
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        insertEmojiIntoInput(e);
      });
      grid.appendChild(btn);
    });

    catDiv.appendChild(grid);
    dom.emojiPickerPanel.appendChild(catDiv);
  });

  dom.emojiPickerBtn.addEventListener("click", (evt) => {
    evt.stopPropagation();
    const isHidden = dom.emojiPickerPanel.style.display === "none";
    dom.emojiPickerPanel.style.display = isHidden ? "flex" : "none";
  });

  document.addEventListener("click", (evt) => {
    if (dom.emojiPickerPanel && dom.emojiPickerPanel.style.display !== "none") {
      if (!dom.emojiPickerPanel.contains(evt.target) && !dom.emojiPickerBtn.contains(evt.target)) {
        dom.emojiPickerPanel.style.display = "none";
      }
    }
  });
}

function processImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      return reject(new Error("File is not an image"));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const MAX_DIM = 1024;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateImagePreviewUI() {
  if (!dom.imagePreviewContainer) return;
  const images = state.pendingAttachedImages || [];
  if (images.length === 0) {
    dom.imagePreviewContainer.style.display = "none";
    dom.imagePreviewContainer.innerHTML = "";
    return;
  }
  dom.imagePreviewContainer.style.display = "flex";
  dom.imagePreviewContainer.innerHTML = "";

  images.forEach((imgUrl, index) => {
    const item = document.createElement("div");
    item.className = "image-preview-item";

    const img = document.createElement("img");
    img.src = imgUrl;
    img.className = "image-preview-img";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "image-preview-remove";
    removeBtn.innerHTML = "&times;";
    removeBtn.title = "Remove image";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.pendingAttachedImages.splice(index, 1);
      updateImagePreviewUI();
    });

    item.appendChild(img);
    item.appendChild(removeBtn);
    dom.imagePreviewContainer.appendChild(item);
  });
}

async function finalizeDirectivesInChatMessage(chatId, userMessage = "") {
  const currentChat = state.chats[chatId] || [];
  const lastMsg = currentChat[currentChat.length - 1];
  if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.content) return;

  // 1. Tag-based instant check (<!-- GOAL_REACHED: 1 -->, etc.)
  const { cleanContent, completedDirectives } = checkAndCompleteDirectives(chatId, lastMsg.content);
  if (completedDirectives.length > 0) {
    lastMsg.content = cleanContent;
    completedDirectives.forEach(d => {
      showStateNotification(`🎯 Цель идеи достигнута: «${d.text}» (отключена)`);
    });
  }

  // 2. Intelligent semantic check via Jev for remaining active directives
  const list = state.characterDirectives?.[chatId] || [];
  const remainingActive = list.filter(d => d.active !== false && d.mode !== "keep");
  if (remainingActive.length === 0) return;

  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (!apiConfig.apiKey) return;

  try {
    const jevCompleted = await checkDirectivesWithJev({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      apiProvider: apiConfig.apiProvider,
      model: state.apiSettings.jevModel,
      userMessage,
      characterResponse: lastMsg.content,
      activeDirectives: remainingActive,
      threshold: 0.70
    });

    if (jevCompleted && jevCompleted.length > 0) {
      let anyChanged = false;
      jevCompleted.forEach(({ directive, confidence }) => {
        const target = list.find(d => d.id === directive.id);
        if (target && target.active !== false) {
          target.active = false;
          target.completed = true;
          anyChanged = true;
          const pct = Math.round(confidence * 100);
          showStateNotification(`🎯 Jev Детектор: Цель «${target.text}» выполнена (${pct}%)`);
        }
      });
      if (anyChanged) {
        saveCharacterDirectives(state.characterDirectives);
        renderDirectivesBar();
      }
    }
  } catch (err) {
    console.warn("[Jev Directive Detector] Error:", err);
  }
}

async function handleSendMessage(event) {
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
  if (dom.emojiPickerPanel) dom.emojiPickerPanel.style.display = "none";
  if (state.isStreaming) return;

  const userInput = dom.messageInput.value.trim();
  const attachedImages = [...(state.pendingAttachedImages || [])];
  const hasImages = attachedImages.length > 0;
  if (!userInput && !hasImages) return;

  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  const character = isGm ? null : getActiveCharacter();
  syncApiSettingsFromInputs();
  
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);

  if (isGm && !activeId) return setStatus("Create or select a GM Scene first.");
  if (!isGm && !character) return setStatus("Create or select a character first.");
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) return setStatus("Paste OpenRouter API key first.");
  if (!apiConfig.model) return setStatus("Select a model first.");

  if (apiConfig.baseUrl === null) {
    saveApiKey(apiConfig.apiKey);
  }
  saveApiSettings(state.apiSettings);
  state.isStreaming = true;
  dom.sendBtn.disabled = true;
  setStatus("Assistant is typing...");

  const startsWithQuote = userInput.startsWith("> ");
  const activeChatId = getActiveChatId(activeId);
  const currentChat = state.chats[activeChatId] || [];
  let quoteIndex = null;

  if (startsWithQuote) {
    if (state.replyingToMessageIndex !== null && state.replyingToMessageIndex < currentChat.length) {
      quoteIndex = state.replyingToMessageIndex;
    } else {
      const firstLine = userInput.split("\n")[0].slice(2).trim();
      const foundIdx = currentChat.findLastIndex(msg => msg.content.includes(firstLine));
      if (foundIdx !== -1) {
        quoteIndex = foundIdx;
      } else {
        quoteIndex = currentChat.length - 1 >= 0 ? currentChat.length - 1 : null;
      }
    }
  }

  state.replyingToMessageIndex = null;

  state.pendingAttachedImages = [];
  updateImagePreviewUI();

  const now = Date.now();
  const userMsg = {
    role: "user",
    content: userInput,
    timestamp: now,
    replyTo: null,
    reaction: null
  };
  if (state.pendingTimeSkipData) {
    userMsg.isTimeSkip = true;
    userMsg.timeText = state.pendingTimeSkipData.timeText;
    userMsg.detailText = state.pendingTimeSkipData.detailText;
    state.pendingTimeSkipData = null;

    // Update Session Memory setting time if active
    const mem = getSessionMemory(activeChatId);
    if (mem) {
      mem.setting = mem.setting || {};
      mem.setting.time = userMsg.timeText;
      saveSessionMemory(activeChatId, mem);
      state.sessionMemories[activeChatId] = mem;
      renderSessionCodex(activeChatId);
    }
  }
  if (hasImages) {
    userMsg.images = attachedImages;
  }
  state.chats = appendMessage(state.chats, activeChatId, userMsg);
  state.chats = appendMessage(state.chats, activeChatId, {
    role: "assistant",
    content: "",
    timestamp: now + 1,
    replyTo: null,
    reaction: null,
    isGmMessage: isGm
  });
  saveChats(state.chats);
  renderMessages();
  state.selectedMessageIndex = null;
  dom.messageInput.value = "";
  autoResizeComposer();

  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();
  // Check if this is a duo chat and use duo message builder
  const chatMeta = (state.chatMetadata[activeId] || []).find(c => c.id === activeChatId);
  const isDuo = !isGm && chatMeta && isDuoChat(chatMeta);

  try {
    if (isDuo) {
      const char2 = state.characters.find(c => c.id === chatMeta.secondaryCharacterId);
      if (!char2) throw new Error("Secondary character not found");
      const states = getChatStates(activeChatId);

      const primaryChar = state.characters.find(c => c.id === chatMeta.primaryCharacterId) || character;
      let sharedScenario = replaceMacros(primaryChar.scenario || "", primaryChar);
      if (!sharedScenario.trim()) {
        sharedScenario = replaceMacros(char2.scenario || "", char2);
      }

      const recentChat = state.chats?.[activeChatId] || [];
      const enrichedQuery = `${recentChat.slice(-4).map(m => m.content).join(" ")} ${userInput}`;
      const ragMemories = await retrieveRelevantMemoriesAsync(activeChatId, enrichedQuery, 3, apiConfig.apiKey, {
        model: state.apiSettings.jevModel,
        apiProvider: apiConfig.apiProvider,
        baseUrl: apiConfig.baseUrl
      });
      if (ragMemories && ragMemories.length > 0) {
        const hasJev = ragMemories.some(m => typeof m.jevRelevance === "number");
        const badge = hasJev ? "🧠 Jev Память" : "🔍 RAG Память";
        showStateNotification(`${badge}: Извлечено ${ragMemories.length} релевантных воспоминаний`);
      }

      // Generate Char 1
      const requestMsg1 = buildApiMessages(character, userInput, quoteIndex, char2, states, activeChatId, sharedScenario, ragMemories);
      let finalText1 = "";
      setStatus(`[Duo] ${character.name} is typing...`);
      try {
        finalText1 = await sendMessageStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
          messages: requestMsg1, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
          signal: state.abortController.signal, enableThinking: apiConfig.enableThinking,
          onToken: (agg) => {
            state.chats = replaceLastAssistantMessage(state.chats, activeChatId, agg);
            renderMessagesThrottled();
          }
        });
      } catch (e) {
        finalText1 = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
          messages: requestMsg1, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
          signal: state.abortController.signal, enableThinking: apiConfig.enableThinking
        });
      }
      
      // Save Char 1
      const cleanedText1 = stripPartnerVoice(finalText1 || "", char2.name) || "(empty response)";
      state.chats = replaceLastAssistantMessage(state.chats, activeChatId, cleanedText1);
      state.chats[activeChatId][state.chats[activeChatId].length - 1].characterId = character.id;
      
      if (state.abortController.signal.aborted) throw new Error("Aborted");

      // Prepare for Char 2
      state.chats = appendMessage(state.chats, activeChatId, {
        role: "assistant", content: "", timestamp: Date.now(), characterId: char2.id
      });
      saveChats(state.chats);
      renderMessages();

      // Generate Char 2
      const requestMsg2 = buildApiMessages(char2, userInput, quoteIndex, character, states, activeChatId, sharedScenario, ragMemories);
      let finalText2 = "";
      setStatus(`[Duo] ${char2.name} is typing...`);
      try {
        finalText2 = await sendMessageStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
          messages: requestMsg2, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
          signal: state.abortController.signal, enableThinking: apiConfig.enableThinking,
          onToken: (agg) => {
            state.chats = replaceLastAssistantMessage(state.chats, activeChatId, agg);
            renderMessagesThrottled();
          }
        });
      } catch (e) {
        finalText2 = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
          messages: requestMsg2, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
          signal: state.abortController.signal, enableThinking: apiConfig.enableThinking
        });
      }

      // Save Char 2
      const cleanedText2 = stripPartnerVoice(finalText2 || "", character.name) || "(empty response)";
      state.chats = replaceLastAssistantMessage(state.chats, activeChatId, cleanedText2);
      state.chats[activeChatId][state.chats[activeChatId].length - 1].characterId = char2.id;
      saveChats(state.chats);
      renderMessages();
      setStatus("Ready");

      const fullResponse = `${cleanedText1}\n\n${cleanedText2}`;
      runTurnEvaluationBackground({
        character,
        char2,
        activeChatId,
        userMessage: userInput,
        characterResponse: fullResponse,
        isDuo: true,
        isGm: false
      });
      maybeAutoUpdateSessionCodex(activeChatId);

    } else {
      // Solo Mode / GM Mode
      const recentChat = state.chats?.[activeChatId] || [];
      const enrichedQuery = `${recentChat.slice(-4).map(m => m.content).join(" ")} ${userInput}`;
      const ragMemories = await retrieveRelevantMemoriesAsync(activeChatId, enrichedQuery, 3, apiConfig.apiKey, {
        model: state.apiSettings.jevModel,
        apiProvider: apiConfig.apiProvider,
        baseUrl: apiConfig.baseUrl
      });
      if (ragMemories && ragMemories.length > 0) {
        const hasJev = ragMemories.some(m => typeof m.jevRelevance === "number");
        const badge = hasJev ? "🧠 Jev Память" : "🔍 RAG Память";
        showStateNotification(`${badge}: Извлечено ${ragMemories.length} релевантных воспоминаний`);
      }
      const requestMessages = buildApiMessages(character, userInput, quoteIndex, null, null, activeChatId, null, ragMemories);
      let finalText = "";
      let streamedSuccessfully = false;
      setStatus(isGm ? "GM is typing..." : `${character.name} is typing...`);
      try {
        finalText = await sendMessageStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
          messages: requestMessages, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
          signal: state.abortController?.signal, enableThinking: apiConfig.enableThinking,
          onToken: (agg) => {
            state.chats = replaceLastAssistantMessage(state.chats, activeChatId, agg);
            renderMessagesThrottled();
          }
        });
        streamedSuccessfully = true;
      } catch (e) {
        const chatNow = state.chats[activeChatId] || [];
        const lastMsg = chatNow[chatNow.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.content && lastMsg.content.trim().length > 0) {
          finalText = lastMsg.content.trim();
          streamedSuccessfully = true;
        } else {
          // Stream failed without output — use non-stream fallback
          finalText = await sendMessageNonStream({
            apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
            messages: requestMessages, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
            signal: state.abortController?.signal, enableThinking: apiConfig.enableThinking
          });
        }
      }

      // Only overwrite state if non-stream fallback was used (prevents visible text swap at stream end)
      if (!streamedSuccessfully) {
        state.chats = replaceLastAssistantMessage(state.chats, activeChatId, finalText || "(empty response)");
      } else if (!finalText) {
        const chatNow = state.chats[activeChatId] || [];
        const lastMsg = chatNow[chatNow.length - 1];
        if (!lastMsg || !lastMsg.content) {
          state.chats = replaceLastAssistantMessage(state.chats, activeChatId, "(empty response)");
        }
      }
      finalizeDirectivesInChatMessage(activeChatId, userInput);
      saveChats(state.chats);
      renderMessages();
      setStatus("Ready");

      runTurnEvaluationBackground({
        character,
        activeChatId,
        userMessage: userInput,
        characterResponse: finalText,
        isDuo: false,
        isGm
      });
      maybeAutoUpdateSessionCodex(activeChatId);
    }

  } catch (error) {
    const errorMsg = mapOpenRouterError(error);
    state.chats = replaceLastAssistantMessage(
      state.chats,
      activeChatId,
      `Error: ${errorMsg}`
    );
    saveChats(state.chats);
    renderMessages();
    setStatus(errorMsg);
  } finally {
    state.retryStatus = null;
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    state.abortController = null;
  }
}

// ── DUO MODE: State evaluator ──

async function evaluateDuoStateChangesBackground(char1, char2, activeChatId, userMessage, characterResponse) {
  if (state.apiSettings?.enableEvaluator === false) return;
  const char1States = char1.coreStates || [];
  const char2States = char2.coreStates || [];
  
  if (char1States.length === 0 && char2States.length === 0) return; // No custom states to evaluate!

  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) return;

  const currentStates = getChatStates(activeChatId);

  // Format description of tracked states for Char 1
  const char1Desc = char1States.map(cs => {
    const val = currentStates[cs.key] !== undefined ? currentStates[cs.key] : cs.defaultValue;
    return `- "${cs.key}" (internal key: "${cs.key}", displayName: "${cs.displayName || cs.key}"): current value ${val}/100.`;
  }).join("\n");

  // Format description of tracked states for Char 2
  const char2Desc = char2States.map(cs => {
    const internalKey = `duo_${cs.key}`;
    const val = currentStates[internalKey] !== undefined ? currentStates[internalKey] : cs.defaultValue;
    return `- "${cs.key}" (internal key: "${internalKey}", displayName: "${cs.displayName || cs.key}"): current value ${val}/100.`;
  }).join("\n");

  const systemPrompt = `You are the State Evaluator for a DUO roleplay (two AI characters + user).
Your task is to analyze the recent interaction and output state changes for both characters.

Character 1 (${char1.name}) tracked states:
${char1Desc || "(none)"}

Character 2 (${char2.name}) tracked states:
${char2Desc || "(none)"}

Rules:
1. Calculate delta changes (between -5 and +5) for the active states listed above based on the interaction.
2. Return ONLY a raw JSON object containing the updates to their internal keys. No markdown codeblocks, no explanations.

Example format:
{
  "changes": {
    "respect": 2,
    "duo_tension": -1
  }
}`;

  const promptMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `User said: "${userMessage}"\n\nCharacters replied:\n"${characterResponse}"` }
  ];

  try {
    const jsonString = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: state.apiSettings.evaluatorModel || apiConfig.model,
      messages: promptMessages,
      temperature: 0.7,
      maxTokens: 300
    });

    const parsed = parseLlmJson(jsonString);
    if (parsed && parsed.changes) {
      const proposals = Object.entries(parsed.changes).map(([key, value]) => {
        let type = "string";
        let parsedValue = value;
        if (typeof value === "number") {
          type = "number";
        } else if (typeof value === "boolean") {
          type = "boolean";
        } else if (typeof value === "string") {
          const cleanVal = value.trim().replace(/%/g, '');
          if (/^[+-]?\d+$/.test(cleanVal)) {
            type = "number";
            parsedValue = Number(cleanVal);
          }
        }
        return { key, value: parsedValue, type, reason: "Duo evaluation" };
      });

      const duoChanges = [];
      if (proposals.length > 0) {
        proposals.forEach(p => {
          const isSecondary = p.key.startsWith("duo_") && !p.key.startsWith("duo_relationship");
          const character = isSecondary ? char2 : char1;
          const applied = autoApplyDuoProposal(character, activeChatId, p);
          if (applied) duoChanges.push(applied);
        });
      }
      return duoChanges;
    }
    return [];
  } catch (err) {
    console.error("[Duo State Agent] Failed to evaluate states:", err);
    return [];
  }
}

function autoApplyDuoProposal(character, activeChatId, proposal) {
  if (!proposal || !proposal.key) return null;
  const currentStates = { ...getChatStates(activeChatId) };
  const originalValue = currentStates[proposal.key];
  const type = getStateType(proposal.key, state.customStateTypes);

  let newValue;
  const isNew = originalValue === undefined;
  if (type === "number" || (typeof proposal.value === "number" && proposal.key.startsWith("duo_"))) {
    const rawVal = Number(proposal.value);
    if (isNaN(rawVal)) return null;
    
    if (isNew) {
      // Initialize new custom state directly to the starting value suggested by LLM, clamped to [0, 100]
      newValue = Math.min(100, Math.max(0, rawVal));
      console.log(`[Duo States] ${proposal.key} initialized as new state with value: ${newValue}`);
    } else {
      const orig = typeof originalValue === "number" ? originalValue : 50;
      let scaledDelta = rawVal !== 0 ? Math.min(6, Math.max(-6, rawVal)) : 0;
      if (character && character.traits) {
        const modified = modifyValueByTraits(character, proposal.key.replace("duo_", ""), scaledDelta);
        if (typeof modified.value === "number") scaledDelta = modified.value;
      }
      newValue = orig + scaledDelta;
    }
  } else if (type === "boolean") {
    newValue = proposal.value === true || proposal.value === "true";
  } else {
    newValue = proposal.value;
  }

  const normalized = normalizeStateValue(type === "string" ? "string" : type, newValue, proposal.key);
  if (normalized === originalValue) return null;

  currentStates[proposal.key] = normalized;
  state.chatStates[activeChatId] = currentStates;
  saveChatStates(state.chatStates);

  const diff = typeof normalized === 'number' && typeof originalValue === 'number' ? normalized - originalValue : 0;
  let logMsg = "";
  if (typeof normalized === 'number') {
    const sign = diff >= 0 ? "+" : "";
    logMsg = `${proposal.key.toUpperCase()} ${sign}${diff} → ${normalized}`;
  } else {
    logMsg = `${proposal.key.toUpperCase()}: ${normalized}`;
  }
  if (proposal.reason) logMsg += ` | ${proposal.reason}`;
  addEventLogEntry(activeChatId, logMsg);

  renderStates();
  renderProgressBar();
  renderMoodIndicator();
  showStateNotification(logMsg);

  return {
    key: proposal.key,
    name: (character?.coreStates && character.coreStates.find(cs => cs.key === (proposal.key.startsWith("duo_") ? proposal.key.replace("duo_", "") : proposal.key))?.displayName) || proposal.key,
    oldVal: originalValue !== undefined ? originalValue : null,
    newVal: normalized,
    diff: typeof normalized === 'number' && typeof originalValue === 'number' ? normalized - originalValue : null,
    isNew,
    type
  };
}

// ── DUO MODE: Chat creation ──

function handleCreateDuoChat() {
  const char1 = getActiveCharacter();
  if (!char1) return setStatus("Select a primary character first.");
  if (state.characters.length < 2) return setStatus("Need at least 2 characters for Duo Mode.");

  if (dom.duoCharSelectDialog) {
    const select = dom.duoCharSelect;
    if (select) {
      select.innerHTML = "";
      state.characters
        .filter(c => c.id !== char1.id)
        .forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.name;
          select.appendChild(opt);
        });
    }
    dom.duoCharSelectDialog.showModal();
  }
}

function handleConfirmDuoChat() {
  const char1 = getActiveCharacter();
  if (!char1) return;
  const secondaryId = dom.duoCharSelect ? dom.duoCharSelect.value : "";
  if (!secondaryId) return setStatus("Select a second character.");

  const char2 = state.characters.find(c => c.id === secondaryId);
  if (!char2) return;

  const duoChatId = createDuoChatId(char1.id, char2.id);
  const chatName = `👥 ${char1.name} & ${char2.name}`;

  const chats = state.chatMetadata[char1.id] || [];
  chats.push({
    id: duoChatId,
    name: chatName,
    createdAt: Date.now(),
    type: "duo",
    primaryCharacterId: char1.id,
    secondaryCharacterId: char2.id,
    duoRelationship: "strangers"
  });
  state.chatMetadata[char1.id] = chats;
  saveChatMetadata(state.chatMetadata);
  setActiveChatId(char1.id, duoChatId);

  state.chatStates[duoChatId] = getDefaultDuoStates();
  saveChatStates(state.chatStates);

  state.chats[duoChatId] = [];
  saveChats(state.chats);

  if (dom.duoCharSelectDialog) dom.duoCharSelectDialog.close();
  switchActiveCharacter(char1.id);
  setStatus("Duo chat created!");

  triggerDuoFirstMessage(char1, char2, duoChatId);
}

async function triggerDuoFirstMessage(char1, char2, chatId) {
  if (state.isStreaming) return;
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) return;

  const states = getChatStates(chatId);
  const promptOverride = "[System: This is the start of the chat. Generate a greeting. You are meeting the user for the first time. Speak in-character.]";

  state.isStreaming = true;
  if (dom.sendBtn) dom.sendBtn.disabled = true;

  if (state.abortController) state.abortController.abort();
  state.abortController = new AbortController();

  let sharedScenario = replaceMacros(char1.scenario || "", char1);
  if (!sharedScenario.trim()) {
    sharedScenario = replaceMacros(char2.scenario || "", char2);
  }

  try {
    // Generate Char 1
    state.chats = appendMessage(state.chats, chatId, {
      role: "assistant", content: "", timestamp: Date.now(), characterId: char1.id
    });
    saveChats(state.chats);
    renderMessages();

    setStatus(`[Duo] ${char1.name} is typing...`);
    const requestMsg1 = buildApiMessages(char1, promptOverride, null, char2, states, chatId, sharedScenario);
    let finalText1 = "";
    try {
      finalText1 = await sendMessageStream({
        apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
        messages: requestMsg1, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
        signal: state.abortController.signal, enableThinking: apiConfig.enableThinking,
        onToken: (agg) => {
          state.chats = replaceLastAssistantMessage(state.chats, chatId, agg);
          renderMessagesThrottled();
        }
      });
    } catch (e) {
      finalText1 = await sendMessageNonStream({
        apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
        messages: requestMsg1, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
        signal: state.abortController.signal, enableThinking: apiConfig.enableThinking
      });
    }

    const cleanedFirst1 = stripPartnerVoice(finalText1 || "", char2.name) || "(empty response)";
    state.chats = replaceLastAssistantMessage(state.chats, chatId, cleanedFirst1);
    state.chats[chatId][state.chats[chatId].length - 1].characterId = char1.id;
    if (state.abortController.signal.aborted) throw new Error("Aborted");

    // Generate Char 2
    state.chats = appendMessage(state.chats, chatId, {
      role: "assistant", content: "", timestamp: Date.now(), characterId: char2.id
    });
    saveChats(state.chats);
    renderMessages();

    setStatus(`[Duo] ${char2.name} is typing...`);
    const requestMsg2 = buildApiMessages(char2, promptOverride, null, char1, states, chatId, sharedScenario);
    let finalText2 = "";
    try {
      finalText2 = await sendMessageStream({
        apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
        messages: requestMsg2, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
        signal: state.abortController.signal, enableThinking: apiConfig.enableThinking,
        onToken: (agg) => {
          state.chats = replaceLastAssistantMessage(state.chats, chatId, agg);
          renderMessagesThrottled();
        }
      });
    } catch (e) {
      finalText2 = await sendMessageNonStream({
        apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
        messages: requestMsg2, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
        signal: state.abortController.signal, enableThinking: apiConfig.enableThinking
      });
    }

    const cleanedFirst2 = stripPartnerVoice(finalText2 || "", char1.name) || "(empty response)";
    state.chats = replaceLastAssistantMessage(state.chats, chatId, cleanedFirst2);
    state.chats[chatId][state.chats[chatId].length - 1].characterId = char2.id;
    
    finalizeDirectivesInChatMessage(chatId);
    saveChats(state.chats);
    renderMessages();
    setStatus("Ready");
  } catch (err) {
    const errorMsg = mapOpenRouterError(err);
    state.chats = replaceLastAssistantMessage(state.chats, chatId, `*Error: ${errorMsg}*`);
    saveChats(state.chats);
    renderMessages();
    setStatus(errorMsg);
  } finally {
    state.retryStatus = null;
    state.isStreaming = false;
    if (dom.sendBtn) dom.sendBtn.disabled = false;
    state.abortController = null;
  }
}

async function handleInlineRegenerate(msgIndex) {
  if (state.isStreaming) return;

  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  const character = isGm ? null : getActiveCharacter();
  
  if (isGm && !activeId) return;
  if (!isGm && !character) return;
  const activeChatId = getActiveChatId(activeId);
  const chat = state.chats[activeChatId] || [];
  
  if (msgIndex < 0 || msgIndex >= chat.length) return;
  const targetMsg = chat[msgIndex];
  if (targetMsg.role !== "assistant") return;

  let userMsgIndex = msgIndex - 1;
  let isRegeneratingSecondOfDuo = false;

  const chatMeta = (state.chatMetadata[activeId] || []).find(c => c.id === activeChatId);
  const isDuo = !isGm && chatMeta && isDuoChat(chatMeta);

  if (isDuo && userMsgIndex >= 0 && chat[userMsgIndex].role === "assistant") {
    if (userMsgIndex - 1 >= 0 && chat[userMsgIndex - 1].role === "user") {
      userMsgIndex = userMsgIndex - 1;
      isRegeneratingSecondOfDuo = true;
    }
  }

  syncApiSettingsFromInputs();
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) return setStatus("Paste OpenRouter API key first.");
  if (!apiConfig.model) return setStatus("Select a model first.");

  if (msgIndex === 0) {
    state.chats = { ...state.chats, [activeChatId]: [] };
    saveChats(state.chats);
    renderMessages();
    if (isGm) {
      state.chats[activeChatId] = [{
        role: "assistant",
        content: "[CHARACTER: Narrator]\nСцена начата заново. Напишите сообщение, чтобы продолжить историю.",
        timestamp: Date.now(),
        isGmMessage: true
      }];
      saveChats(state.chats);
      renderMessages();
    } else {
      await triggerAutoFirstMessage(character.id);
    }
    return;
  }

  if (userMsgIndex < 0 || chat[userMsgIndex].role !== "user") {
    return setStatus("Cannot regenerate: no user message context found.");
  }

  const userPrompt = chat[userMsgIndex].content;
  
  const truncated = chat.slice(0, msgIndex);
  state.chats = { ...state.chats, [activeChatId]: truncated };
  rollbackSummaryForChat(activeChatId, truncated.length);
  renderMessages();

  state.isStreaming = true;
  if (dom.sendBtn) dom.sendBtn.disabled = true;
  setStatus("Regenerating response...");

  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();

  const now = Date.now();
  const char2 = isDuo ? state.characters.find(c => c.id === chatMeta.secondaryCharacterId) : null;
  const states = getChatStates(activeChatId);

  try {
    if (isDuo && char2) {
      // --- DUO REGENERATION ---
      const primaryChar = state.characters.find(c => c.id === chatMeta.primaryCharacterId) || character;
      let sharedScenario = replaceMacros(primaryChar.scenario || "", primaryChar);
      if (!sharedScenario.trim()) {
        sharedScenario = replaceMacros(char2.scenario || "", char2);
      }
      
      if (isRegeneratingSecondOfDuo) {
        // --- DUO SINGLE CHARACTER REGENERATION (Only regenerate the second character) ---
        const targetChar = state.characters.find(c => c.id === targetMsg.characterId) || char2;
        const partnerChar = targetChar.id === primaryChar.id ? char2 : primaryChar;

        state.chats = appendMessage(state.chats, activeChatId, {
          role: "assistant", content: "", timestamp: Date.now(), characterId: targetChar.id
        });
        saveChats(state.chats);
        renderMessages();

        setStatus(`[Duo] ${targetChar.name} is typing...`);
        const requestMsg = buildApiMessages(targetChar, userPrompt, null, partnerChar, states, activeChatId, sharedScenario);

        let finalText = "";
        try {
          finalText = await sendMessageStream({
            apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
            messages: requestMsg, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
            signal: state.abortController.signal, enableThinking: apiConfig.enableThinking,
            onToken: (agg) => {
              state.chats = replaceLastAssistantMessage(state.chats, activeChatId, agg);
              renderMessagesThrottled();
            }
          });
        } catch (e) {
          finalText = await sendMessageNonStream({
            apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
            messages: requestMsg, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
            signal: state.abortController.signal, enableThinking: apiConfig.enableThinking
          });
        }

        const regenClean = stripPartnerVoice(finalText || "", partnerChar.name) || "(empty response)";
        state.chats = replaceLastAssistantMessage(state.chats, activeChatId, regenClean);
        state.chats[activeChatId][state.chats[activeChatId].length - 1].characterId = targetChar.id;
        finalizeDirectivesInChatMessage(activeChatId, userPrompt);
        saveChats(state.chats);
        renderMessages();
        setStatus("Regeneration completed.");

        const isTargetSecondary = (targetChar.id === char2.id);
        const regenClean1 = isTargetSecondary ? (truncated[truncated.length - 1]?.content || "") : regenClean;
        const regenClean2 = isTargetSecondary ? regenClean : (truncated[truncated.length - 1]?.content || "");
        runTurnEvaluationBackground({
          character: primaryChar,
          char2,
          activeChatId,
          userMessage: userPrompt,
          characterResponse: regenClean1 + "\n\n" + regenClean2,
          isDuo: true,
          isGm: false
        });
      } else {
        // --- DUO SEQUENTIAL REGENERATION ---
        // 1. Generate Char 1
        state.chats = appendMessage(state.chats, activeChatId, {
          role: "assistant", content: "", timestamp: Date.now(), characterId: character.id
        });
        saveChats(state.chats);
        renderMessages();

        setStatus(`[Duo] ${character.name} is typing...`);
        const requestMsg1 = buildApiMessages(character, userPrompt, null, char2, states, activeChatId, sharedScenario);
        
        let finalText1 = "";
        try {
          finalText1 = await sendMessageStream({
            apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
            messages: requestMsg1, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
            signal: state.abortController.signal, enableThinking: apiConfig.enableThinking,
            onToken: (agg) => {
              state.chats = replaceLastAssistantMessage(state.chats, activeChatId, agg);
              renderMessagesThrottled();
            }
          });
        } catch (e) {
          finalText1 = await sendMessageNonStream({
            apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
            messages: requestMsg1, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
            signal: state.abortController.signal, enableThinking: apiConfig.enableThinking
          });
        }

        const regenClean1 = stripPartnerVoice(finalText1 || "", char2.name) || "(empty response)";
        state.chats = replaceLastAssistantMessage(state.chats, activeChatId, regenClean1);
        state.chats[activeChatId][state.chats[activeChatId].length - 1].characterId = character.id;
        if (state.abortController.signal.aborted) throw new Error("Aborted");

        // 2. Generate Char 2
        state.chats = appendMessage(state.chats, activeChatId, {
          role: "assistant", content: "", timestamp: Date.now(), characterId: char2.id
        });
        saveChats(state.chats);
        renderMessages();

        setStatus(`[Duo] ${char2.name} is typing...`);
        const requestMsg2 = buildApiMessages(char2, userPrompt, null, character, states, activeChatId, sharedScenario);
        
        let finalText2 = "";
        try {
          finalText2 = await sendMessageStream({
            apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
            messages: requestMsg2, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
            signal: state.abortController.signal, enableThinking: apiConfig.enableThinking,
            onToken: (agg) => {
              state.chats = replaceLastAssistantMessage(state.chats, activeChatId, agg);
              renderMessagesThrottled();
            }
          });
        } catch (e) {
          finalText2 = await sendMessageNonStream({
            apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
            messages: requestMsg2, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
            signal: state.abortController.signal, enableThinking: apiConfig.enableThinking
          });
        }

        const regenClean2 = stripPartnerVoice(finalText2 || "", character.name) || "(empty response)";
        state.chats = replaceLastAssistantMessage(state.chats, activeChatId, regenClean2);
        state.chats[activeChatId][state.chats[activeChatId].length - 1].characterId = char2.id;
        saveChats(state.chats);
        renderMessages();
        runTurnEvaluationBackground({
          character,
          char2,
          activeChatId,
          userMessage: userPrompt,
          characterResponse: regenClean1 + "\n\n" + regenClean2,
          isDuo: true,
          isGm: false
        });
      }
    } else {
      // --- SOLO REGENERATION ---
      state.chats = appendMessage(state.chats, activeChatId, {
        role: "assistant", content: "", timestamp: Date.now(), isGmMessage: isGm
      });
      saveChats(state.chats);
      renderMessages();
      
      const recentChat = state.chats?.[activeChatId] || [];
      const enrichedQuery = `${recentChat.slice(-4).map(m => m.content).join(" ")} ${userPrompt}`;
      const ragMemories = await retrieveRelevantMemoriesAsync(activeChatId, enrichedQuery, 3, apiConfig.apiKey, {
        model: state.apiSettings.jevModel,
        apiProvider: apiConfig.apiProvider,
        baseUrl: apiConfig.baseUrl
      });
      const requestMessages = buildApiMessages(character, userPrompt, null, null, states, activeChatId, null, ragMemories);
      
      let finalText = "";
      let regenStreamedOk = false;
      try {
        finalText = await sendMessageStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
          messages: requestMessages, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
          signal: state.abortController?.signal, enableThinking: apiConfig.enableThinking,
          onToken: (agg) => {
            state.chats = replaceLastAssistantMessage(state.chats, activeChatId, agg);
            renderMessagesThrottled();
          }
        });
        regenStreamedOk = true;
      } catch (_streamError) {
        // Non-stream fallback
        finalText = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: apiConfig.model,
          messages: requestMessages, temperature: apiConfig.temperature, maxTokens: apiConfig.maxTokens,
          signal: state.abortController?.signal, enableThinking: apiConfig.enableThinking
        });
      }

      if (!regenStreamedOk) {
        state.chats = replaceLastAssistantMessage(state.chats, activeChatId, finalText || "(empty response)");
      } else if (!finalText) {
        state.chats = replaceLastAssistantMessage(state.chats, activeChatId, "(empty response)");
      }
      finalizeDirectivesInChatMessage(activeChatId, userPrompt);
      saveChats(state.chats);
      renderMessages();
      runTurnEvaluationBackground({
        character,
        activeChatId,
        userMessage: userPrompt,
        characterResponse: finalText,
        isDuo: false,
        isGm
      });
    }

  } catch (error) {
    if (error.message !== "Aborted" && error.name !== "AbortError") {
      const errorMsg = mapOpenRouterError(error);
      state.chats = replaceLastAssistantMessage(
        state.chats, activeChatId, `Error: ${errorMsg}`
      );
      saveChats(state.chats);
      renderMessages();
      setStatus(`Regeneration failed: ${errorMsg}`);
    } else {
      setStatus("Regeneration aborted.");
    }
  } finally {
    state.retryStatus = null;
    state.isStreaming = false;
    if (dom.sendBtn) dom.sendBtn.disabled = false;
    state.abortController = null;
  }
}

// --- Chat history, Stage switching and Hotkeys ---

function updateChatStageInMetadata(characterId, chatId, relationshipStage) {
  const chats = state.chatMetadata[characterId] || [];
  const chatIdx = chats.findIndex(c => c.id === chatId);
  if (chatIdx !== -1) {
    const chat = chats[chatIdx];
    const match = chat.name.match(/^(Chat \d+)/);
    if (match) {
      chat.name = `${match[1]} (${relationshipStage})`;
      saveChatMetadata(state.chatMetadata);
      renderChatSelector();
    }
  }
}

function handleNewChat() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const chats = state.chatMetadata[activeId] || [];
  const chatNumber = chats.length + 1;
  const newChatId = `chat_${activeId}_${Date.now()}`;
  
  if (isGm) {
    chats.push({
      id: newChatId,
      name: `Scene Chat ${chatNumber}`,
      createdAt: Date.now(),
      isGmModeEnabled: true,
      activeGroupCharacterIds: []
    });
  } else {
    chats.push({
      id: newChatId,
      name: `Chat ${chatNumber} (Stranger)`,
      createdAt: Date.now(),
      isGmModeEnabled: false,
      activeGroupCharacterIds: []
    });
  }

  state.chatMetadata[activeId] = chats;
  saveChatMetadata(state.chatMetadata);
  setActiveChatId(activeId, newChatId);
  
  if (isGm) {
    state.chats[newChatId] = [{
      role: "assistant",
      content: "[CHARACTER: Narrator]\nСцена начата заново. Напишите сообщение, чтобы продолжить историю.",
      timestamp: Date.now(),
      isGmMessage: true
    }];
    saveChats(state.chats);
    switchActiveGmScene(activeId);
  } else {
    state.chatStates[newChatId] = {};
    initDefaultStatesForCharacter(activeId);
    state.chats[newChatId] = [];
    saveChats(state.chats);
    switchActiveCharacter(activeId);
  }
  
  setStatus("New chat started.");
}

function handleNewChatUserFirst() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const chats = state.chatMetadata[activeId] || [];
  const chatNumber = chats.length + 1;
  const newChatId = `chat_${activeId}_${Date.now()}`;

  chats.push({
    id: newChatId,
    name: `Chat ${chatNumber} (Свой сюжет)`,
    createdAt: Date.now(),
    isGmModeEnabled: false,
    activeGroupCharacterIds: []
  });

  state.chatMetadata[activeId] = chats;
  saveChatMetadata(state.chatMetadata);
  setActiveChatId(activeId, newChatId);

  state.chatStates[newChatId] = {};
  initDefaultStatesForCharacter(activeId);
  state.chats[newChatId] = [];
  saveChats(state.chats);

  const character = state.characters.find(c => c.id === activeId);
  if (character) {
    const origMode = character.firstMessageMode;
    character.firstMessageMode = "user";
    switchActiveCharacter(activeId);
    character.firstMessageMode = origMode || "assistant";
  } else {
    switchActiveCharacter(activeId);
  }

  setStatus("Новый чат создан в режиме «Свой сюжет».");
}

window.triggerAutoFirstMessageGlobal = function(characterId) {
  if (!characterId) characterId = state.activeCharacterId;
  if (!characterId) return;
  
  const character = state.characters.find(c => c.id === characterId);
  const activeChatId = getActiveChatId(characterId);
  if (character && character.firstMessage) {
    state.chats = appendMessage(state.chats, activeChatId, {
      role: "assistant",
      content: replaceMacros(character.firstMessage, character),
      timestamp: Date.now()
    });
    saveChats(state.chats);
    renderMessages();
  } else {
    triggerAutoFirstMessage(characterId);
  }
};

window.generatePlotStarterIdeaGlobal = async function(characterId) {
  if (!characterId) characterId = state.activeCharacterId;
  const character = state.characters.find(c => c.id === characterId);
  if (!character) return;

  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    showStateNotification("Требуется API ключ");
    return;
  }

  setStatus("Складываю варианты сюжета...");
  try {
    const prompt = `You are a creative roleplay assistant.
Generate a compelling 1-2 sentence first message for the USER to send to the character ${character.name}.
Setting/Scenario: ${character.scenario || "General roleplay"}
Personality: ${character.personality || character.behavior || "Roleplay partner"}

Output ONLY the user's first message action and speech in Russian, with actions in asterisks *...* and direct speech in quotes. Do not include any meta text.`;

    const response = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      messages: [{ role: "system", content: prompt }],
      temperature: 0.85,
      maxTokens: 200
    });

    if (response && dom.messageInput) {
      dom.messageInput.value = response.trim();
      autoResizeComposer();
      dom.messageInput.focus();
      showStateNotification("Вариант старта подставлен в поле ввода!");
      setStatus("Plot starter generated.");
    }
  } catch (err) {
    console.error("Failed to generate plot starter idea:", err);
    showStateNotification(`Ошибка: ${err.message}`);
  }
};

function handleConvertChatToGmScene() {
  const isGm = state.sidebarTab === "gm";
  const characterId = state.activeCharacterId;
  const activeChatId = getActiveChatId(isGm ? state.activeGmSceneId : characterId);
  
  if (!activeChatId) {
    showStateNotification("Нет активного чата для переноса!");
    return;
  }

  const currentChatMessages = state.chats[activeChatId] || [];
  if (currentChatMessages.length === 0) {
    showStateNotification("Текущий чат пуст, нечего переносить!");
    return;
  }

  const character = isGm ? null : state.characters.find(c => c.id === characterId);
  const activeChats = state.chatMetadata[isGm ? state.activeGmSceneId : characterId] || [];
  const currentChatMeta = activeChats.find(c => c.id === activeChatId);

  // 1. Create a new GM Scene
  const newSceneId = `scene_${Date.now()}`;
  const sceneName = character ? `GM: ${character.name}` : (currentChatMeta?.name ? `GM: ${currentChatMeta.name}` : "Перенесенная сцена");
  const sceneScenario = character?.scenario || character?.description || "Перенесенный сюжет из обычного чата.";

  // Create NPC array from active character (or empty if none)
  const npcs = character ? [{
    id: character.id,
    name: character.name,
    systemPrompt: character.systemPrompt || character.personality || ""
  }] : [];

  const newScene = {
    id: newSceneId,
    name: sceneName,
    scenario: sceneScenario,
    npcs: npcs,
    createdAt: Date.now()
  };

  state.gmScenes.push(newScene);
  saveGmScenes(state.gmScenes);

  // 2. Prepare transferred chat metadata
  const newChatId = `chat_${newSceneId}_${Date.now()}`;
  const chatName = currentChatMeta?.name ? `${currentChatMeta.name} (GM)` : `История ${character?.name || 'чата'}`;

  const transferredChatMeta = {
    id: newChatId,
    name: chatName,
    createdAt: Date.now(),
    isGmModeEnabled: true,
    activeGroupCharacterIds: character ? [character.id] : []
  };

  state.chatMetadata[newSceneId] = [transferredChatMeta];
  saveChatMetadata(state.chatMetadata);
  setActiveChatId(newSceneId, newChatId);

  // 3. Format and transfer messages
  const transferredMessages = currentChatMessages.map(msg => {
    const cloned = { ...msg, isGmMessage: true };
    if (cloned.role === "assistant") {
      if (character && !cloned.characterId) {
        cloned.characterId = character.id;
      }
      if (character && !cloned.content.trim().startsWith("[CHARACTER:") && !cloned.content.trim().startsWith("[")) {
        cloned.content = `[CHARACTER: ${character.name}]\n${cloned.content}`;
      }
    }
    return cloned;
  });

  state.chats[newChatId] = transferredMessages;
  saveChats(state.chats);

  // 4. Switch sidebar tab to GM Mode and activate the new GM Scene!
  switchSidebarTab("gm");
  saveSidebarTab("gm");

  renderGmScenes();
  switchActiveGmScene(newSceneId);

  showStateNotification(`Чат успешно перенесен в GM Сцену «${sceneName}»!`);
  setStatus("Converted chat to GM Scene.");
}

function handleRenameChat() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;
  
  const activeChatId = getActiveChatId(activeId);
  const chats = state.chatMetadata[activeId] || [];
  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  const newName = prompt("Rename this chat:", chat.name);
  if (newName !== null && newName.trim() !== "") {
    chat.name = newName.trim();
    saveChatMetadata(state.chatMetadata);
    renderChatSelector();
    setStatus("Chat renamed.");
  }
}

function handleRestartChat() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  let chats = state.chatMetadata[activeId] || [];
  const chat = chats.find(c => c.id === activeChatId);
  if (!chat) return;

  if (!confirm("Вы уверены, что хотите перезапустить этот чат? Все последующие сообщения будут удалены (останется только первое сообщение/приветствие).")) {
    return;
  }

  // Preserve the first message if it exists
  const oldHistory = state.chats[activeChatId] || [];
  let firstMessage = null;
  if (oldHistory.length > 0) {
    firstMessage = oldHistory[0];
  }

  // Clear messages but keep the first one
  state.chats[activeChatId] = firstMessage ? [firstMessage] : [];
  saveChats(state.chats);

  // Clear dynamic states
  if (isGm) {
    state.chatStates[activeChatId] = {};
  } else if (chat.type === "duo") {
    state.chatStates[activeChatId] = getDefaultDuoStates();
  } else {
    state.chatStates[activeChatId] = {};
  }
  saveChatStates(state.chatStates);

  // Clear summaries
  delete state.chatSummaries[activeChatId];
  delete state.chatSummarizedMessageCount[activeChatId];
  delete state.chatSummarySnapshots[activeChatId];
  saveChatSummaries(state.chatSummaries);
  saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
  saveChatSummarySnapshots(state.chatSummarySnapshots);

  // Invalidate any in-flight background summarization so it doesn't
  // overwrite the freshly cleared state once it resolves.
  chatSummaryVersion[activeChatId] = (chatSummaryVersion[activeChatId] || 0) + 1;

  // Restart
  if (isGm) {
    if (!firstMessage) {
      state.chats[activeChatId] = [{
        role: "assistant",
        content: "[CHARACTER: Narrator]\nСцена начата заново. Напишите сообщение, чтобы продолжить историю.",
        timestamp: Date.now(),
        isGmMessage: true
      }];
      saveChats(state.chats);
    }
    switchActiveGmScene(activeId);
  } else {
    switchActiveCharacter(activeId);
    
    if (chat.type === "duo" && !firstMessage) {
      const char1 = state.characters.find(c => c.id === chat.primaryCharacterId);
      const char2 = state.characters.find(c => c.id === chat.secondaryCharacterId);
      if (char1 && char2) {
        triggerDuoFirstMessage(char1, char2, activeChatId);
      }
    }
  }

  setStatus("Чат перезапущен.");
}

function handleDeleteChat() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  let chats = state.chatMetadata[activeId] || [];
  const chatIdx = chats.findIndex(c => c.id === activeChatId);
  if (chatIdx === -1) return;

  if (!confirm("Are you sure you want to delete this chat and all its states?")) {
    return;
  }

  delete state.chats[activeChatId];
  delete state.chatStates[activeChatId];
  delete state.chatSummaries[activeChatId];
  delete state.chatSummarizedMessageCount[activeChatId];
  delete state.chatSummarySnapshots[activeChatId];
  saveChats(state.chats);
  saveChatStates(state.chatStates);
  saveChatSummaries(state.chatSummaries);
  saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
  saveChatSummarySnapshots(state.chatSummarySnapshots);

  chats.splice(chatIdx, 1);
  
  if (chats.length === 0) {
    const newChatId = `chat_${activeId}_${Date.now()}`;
    if (isGm) {
      chats = [
        {
          id: newChatId,
          name: "Scene Start",
          createdAt: Date.now(),
          isGmModeEnabled: true,
          activeGroupCharacterIds: []
        }
      ];
      state.chatMetadata[activeId] = chats;
      setActiveChatId(activeId, newChatId);
      state.chats[newChatId] = [{
        role: "assistant",
        content: "[CHARACTER: Narrator]\nСцена создана. Напишите первое сообщение, чтобы начать историю.",
        timestamp: Date.now(),
        isGmMessage: true
      }];
      saveChats(state.chats);
    } else {
      chats = [
        {
          id: newChatId,
          name: "Chat 1 (Stranger)",
          createdAt: Date.now(),
          isGmModeEnabled: false,
          activeGroupCharacterIds: []
        }
      ];
      state.chatMetadata[activeId] = chats;
      setActiveChatId(activeId, newChatId);
      state.chatStates[newChatId] = {};
      initDefaultStatesForCharacter(activeId);
      state.chats[newChatId] = [];
      saveChats(state.chats);
    }
  } else {
    setActiveChatId(activeId, chats[0].id);
  }

  state.chatMetadata[activeId] = chats;
  saveChatMetadata(state.chatMetadata);

  if (isGm) {
    switchActiveGmScene(activeId);
  } else {
    switchActiveCharacter(activeId);
  }
  setStatus("Chat deleted.");
}

async function handleProviderChange() {
  syncApiSettingsFromInputs();
  updateProviderUI();
  await loadModels({ silent: true });
}

function handleHotkey(e) {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    handleSendMessage(e);
  } else if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    undo();
  } else if (e.ctrlKey && e.key === "y") {
    e.preventDefault();
    redo();
  } else if (e.key === "Escape") {
    state.selectedMessageIndex = null;
    renderMessages();
    setStatus("Selection cleared.");
  }
}

// --- Background State Evaluator ---

async function evaluateStateChangesBackground(character, activeChatId, userMessage, characterResponse) {
  if (state.apiSettings?.enableEvaluator === false) return [];
  const customStates = character?.coreStates || [];
  if (customStates.length === 0) return []; // No custom states to evaluate!

  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) return [];

  const currentStates = getChatStates(activeChatId);
  const stateDescriptions = customStates.map(cs => {
    const val = currentStates[cs.key] !== undefined ? currentStates[cs.key] : cs.defaultValue;
    const stagesStr = cs.stages && cs.stages.length === 6 ? ` Stages: ${cs.stages.join(", ")}.` : "";
    return `- "${cs.key}" (${cs.displayName || cs.key}): current value ${val}/100.${stagesStr}`;
  }).join("\n");

  const systemPrompt = `You are the State Evaluator for a roleplay application.
Your task is to analyze the recent interaction between the User and the Character, and update the character's core states.

Tracked States for ${character.name}:
${stateDescriptions}

Rules:
1. You MUST evaluate and return delta changes (between -5 and +5) for the tracked states listed above based on the interaction.
2. Analyze if the interaction was positive/relevant (+1 to +4), negative/contrary (-1 to -4), or neutral (0) for each state.
3. Return ONLY a raw JSON object containing the changes. No markdown codeblocks, no explanations.

Example format:
{
  "changes": {
    "respect": 2,
    "tension": -1
  }
}`;

  const promptMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `User said: "${userMessage}"\n\nCharacter replied: "${characterResponse}"` }
  ];

  try {
    const jsonString = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: state.apiSettings.evaluatorModel || apiConfig.model,
      messages: promptMessages,
      temperature: 0.7,
      maxTokens: 300
    });

    const parsed = parseLlmJson(jsonString);
    if (parsed && parsed.changes) {
      const proposals = Object.entries(parsed.changes).map(([key, value]) => {
        let type = "string";
        let parsedValue = value;
        
        if (typeof value === "number") {
          type = "number";
        } else if (typeof value === "boolean") {
          type = "boolean";
        } else if (typeof value === "string") {
          const cleanVal = value.trim().replace(/%/g, '');
          if (/^[+-]?\d+$/.test(cleanVal)) {
            type = "number";
            parsedValue = Number(cleanVal);
          } else if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
            type = "boolean";
            parsedValue = value.toLowerCase() === "true";
          }
        }
        
        return {
          key,
          value: parsedValue,
          type,
          reason: "Background evaluation"
        };
      });

      if (proposals.length > 0) {
        return autoApplyStateProposals(character, activeChatId, proposals) || [];
      }
    }
    return [];
  } catch (err) {
    console.error("[State Agent] Failed to evaluate states:", err);
    return [];
  }
}

// --- Memory & State Evaluation Coordinator ---

function extractMemorySnapshotFromSummary(summaryText) {
  if (!summaryText || typeof summaryText !== "string") {
    return { location: null, situation: null, codexNote: null };
  }

  let location = null;
  let situation = null;
  let codexNote = null;

  // 1. Match Location / Локация
  const locMatch = summaryText.match(/(?:Локация(?:\s*и\s*обстановка)?|Location(?:\s*&\s*Environment)?)\s*[:—\-]\s*([^\n•]+)/i);
  if (locMatch && locMatch[1]) {
    location = locMatch[1].trim();
  }

  // 2. Match Situation / Активная цель / угроза
  const sitMatch = summaryText.match(/(?:Активная\s*цель(?:\s*\/\s*угроза)?|Active\s*Objective(?:\s*\/\s*Threat)?)\s*[:—\-]\s*([^\n•]+)/i);
  if (sitMatch && sitMatch[1]) {
    situation = sitMatch[1].trim();
  } else {
    const secMatch = summaryText.match(/(?:📍\s*ТЕКУЩАЯ\s*СИТУАЦИЯ|📍\s*CURRENT\s*SITUATION)[:\s]*\n([\s\S]*?)(?=\n(?:📖|👥|📍|$))/i);
    if (secMatch && secMatch[1]) {
      const firstLine = secMatch[1].trim().replace(/^[•\-\*]\s*/gm, '').split('\n')[0];
      if (firstLine) situation = firstLine.trim();
    }
  }

  // 3. Match latest milestone / codex note
  const milestoneMatch = summaryText.match(/(?:📖\s*СЮЖЕТНЫЕ\s*ВЕХИ|📖\s*STORY\s*MILESTONES)[:\s]*\n([\s\S]*?)(?=\n(?:👥|📍|$))/i);
  if (milestoneMatch && milestoneMatch[1]) {
    const bullets = milestoneMatch[1].trim().split('\n').map(b => b.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
    if (bullets.length > 0) {
      codexNote = bullets[bullets.length - 1];
    }
  }

  return { location, situation, codexNote };
}

const codexAutoUpdateInFlight = new Set();

async function maybeAutoUpdateSessionCodex(activeChatId) {
  if (CODEX_AUTO_UPDATE_EVERY <= 0) return;
  if (!activeChatId || codexAutoUpdateInFlight.has(activeChatId)) return;
  const chat = state.chats[activeChatId] || [];
  if (chat.length === 0) return;

  const snapshot = getSessionMemory(activeChatId);
  let processed = getCodexProcessedCount(snapshot);
  if (processed > chat.length) processed = 0;
  if (chat.length - processed < CODEX_AUTO_UPDATE_EVERY) return;

  const start = Math.max(processed, chat.length - CODEX_AUTO_UPDATE_MAX_MESSAGES);
  codexAutoUpdateInFlight.add(activeChatId);
  try {
    const updated = await extractStructuredMemoryFromLLM(snapshot || createDefaultSessionMemory(), chat.slice(start), {
      startIndex: start
    });
    const latest = getSessionMemory(activeChatId);
    const editedMeanwhile = JSON.stringify(latest) !== JSON.stringify(snapshot);
    const toSave = editedMeanwhile ? smartMergeSessionMemory(latest, updated, chat.length) : updated;
    saveSessionMemory(activeChatId, toSave);
    state.sessionMemories[activeChatId] = toSave;

    const viewedId = state.sidebarTab === "gm" ? state.activeGmSceneId : state.activeCharacterId;
    if (getActiveChatId(viewedId) === activeChatId) renderSessionCodex(activeChatId);
  } catch (err) {
    console.warn("[SessionMemory] Auto update failed:", err);
  } finally {
    codexAutoUpdateInFlight.delete(activeChatId);
  }
}

async function runTurnEvaluationBackground(options) {
  const {
    character,
    char2,
    activeChatId,
    userMessage,
    characterResponse,
    isDuo,
    isGm
  } = options;

  if (state.apiSettings?.enableEvaluator === false) return;
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) return;

  const chat = state.chats[activeChatId] || [];
  if (chat.length === 0) return;
  const lastMsg = chat[chat.length - 1];
  if (!lastMsg || lastMsg.role !== "assistant") return;

  // Set in-progress indicator
  lastMsg.evaluatorData = {
    status: "in_progress"
  };
  saveChats(state.chats);
  renderMessages();

  try {
    const statePromise = (async () => {
      try {
        if (isDuo && char2) {
          return await evaluateDuoStateChangesBackground(character, char2, activeChatId, userMessage, characterResponse) || [];
        } else if (!isGm && character) {
          return await evaluateStateChangesBackground(character, activeChatId, userMessage, characterResponse) || [];
        }
      } catch (err) {
        console.warn("[Evaluator] State evaluation error:", err);
      }
      return [];
    })();

    const summaryPromise = (async () => {
      try {
        return await summarizeChatHistoryBackground(character, activeChatId);
      } catch (err) {
        console.warn("[Evaluator] Summary evaluation error:", err);
      }
      return null;
    })();

    const [appliedStates, newSummary] = await Promise.all([statePromise, summaryPromise]);

    const activeSummary = newSummary || state.chatSummaries[activeChatId] || "";
    const memorySnapshot = extractMemorySnapshotFromSummary(activeSummary);

    const hasStates = Array.isArray(appliedStates) && appliedStates.length > 0;
    const hasMemory = Boolean(memorySnapshot.location || memorySnapshot.situation || memorySnapshot.codexNote);

    const targetMsg = (state.chats[activeChatId] || []).find(m => m === lastMsg) || lastMsg;

    if (hasStates || hasMemory) {
      targetMsg.evaluatorData = {
        status: "completed",
        timestamp: Date.now(),
        location: memorySnapshot.location || null,
        situation: memorySnapshot.situation || null,
        codexNote: memorySnapshot.codexNote || null,
        stateChanges: appliedStates || [],
        summarySnippet: activeSummary ? activeSummary.slice(0, 350) : null
      };
    } else {
      delete targetMsg.evaluatorData;
    }

    saveChats(state.chats);
    renderMessages();
  } catch (err) {
    console.error("[Evaluator] Coordinator failed:", err);
    delete lastMsg.evaluatorData;
    saveChats(state.chats);
    renderMessages();
  }
}

// --- Migration & Bootstrapping ---

function migrateDataToMultiChat() {
  let migratedMetadata = false;
  let migratedChats = false;
  let migratedStates = false;

  state.characters.forEach((char) => {
    const charId = char.id;
    if (!state.chatMetadata[charId] || !state.chatMetadata[charId].length) {
      const chatId = `chat_${charId}_default`;
      
      const oldMessages = state.chats[charId];
      if (oldMessages && Array.isArray(oldMessages) && oldMessages.length > 0) {
        state.chats[chatId] = oldMessages;
        delete state.chats[charId];
        migratedChats = true;
      }
      
      const oldStates = state.chatStates[charId];
      if (oldStates && typeof oldStates === "object" && Object.keys(oldStates).length > 0) {
        state.chatStates[chatId] = oldStates;
        delete state.chatStates[charId];
        migratedStates = true;
      }
      
      const currentStage = (state.chatStates[chatId] || {}).relationshipStage || "Stranger";
      state.chatMetadata[charId] = [
        {
          id: chatId,
          name: `Chat 1 (${currentStage})`,
          createdAt: Date.now()
        }
      ];
      migratedMetadata = true;
      setActiveChatId(charId, chatId);
    }
  });

  if (migratedMetadata) {
    saveChatMetadata(state.chatMetadata);
  }
  if (migratedChats) {
    saveChats(state.chats);
  }
  if (migratedStates) {
    saveChatStates(state.chatStates);
  }
}

function registerPersonaEvents() {
  if (dom.composerPersonaBtn) {
    dom.composerPersonaBtn.addEventListener("click", () => {
      if (dom.personaDialog) {
        const activeId = getActivePersonaId();
        selectAdminPersona(activeId, false);
        dom.personaDialog.showModal();
      }
    });
  }

  if (dom.openPersonaBtn) {
    dom.openPersonaBtn.addEventListener("click", () => {
      if (dom.personaDialog) {
        const activeId = getActivePersonaId();
        selectAdminPersona(activeId, false);
        dom.personaDialog.showModal();
      }
    });
  }

  if (dom.createNewPersonaBtn) {
    dom.createNewPersonaBtn.addEventListener("click", () => {
      selectAdminPersona("", true);
    });
  }

  if (dom.headerNewPersonaBtn) {
    dom.headerNewPersonaBtn.addEventListener("click", () => {
      selectAdminPersona("", true);
    });
  }

  if (dom.headerImportPersonaFromCharBtn) {
    dom.headerImportPersonaFromCharBtn.addEventListener("click", () => {
      openPersonaFromCharDialog();
    });
  }

  if (dom.footerImportPersonaFromCharBtn) {
    dom.footerImportPersonaFromCharBtn.addEventListener("click", () => {
      openPersonaFromCharDialog();
    });
  }

  if (dom.adoptActiveCharAsPersonaBtn) {
    dom.adoptActiveCharAsPersonaBtn.addEventListener("click", () => {
      const activeChar = getActiveCharacter();
      if (!activeChar) {
        showStateNotification("Сначала выберите персонажа в чате.");
        return;
      }
      adoptCharacterAsPersona(activeChar, true);
    });
  }

  if (dom.studioMakePersonaBtn) {
    dom.studioMakePersonaBtn.addEventListener("click", () => {
      const studioData = collectStudioData();
      if (!studioData || !studioData.name || studioData.name === "Персонаж") {
        showStateNotification("Сначала заполните данные персонажа в Конструкторе.");
        return;
      }
      adoptCharacterAsPersona(studioData, true);
    });
  }

  if (dom.characterFormMakePersonaBtn) {
    dom.characterFormMakePersonaBtn.addEventListener("click", () => {
      const charId = dom.characterId?.value;
      let targetChar = state.characters.find(c => c.id === charId);
      if (!targetChar) {
        targetChar = {
          id: charId || `char_${Date.now()}`,
          name: dom.characterName?.value || "Персонаж",
          gender: dom.characterGender?.value || "she/her",
          description: dom.characterDescription?.value || "",
          personality: dom.characterPersonality?.value || "",
          appearance: dom.characterAppearance?.value || "",
          behavior: dom.characterBehavior?.value || "",
          speech: dom.characterSpeech?.value || "",
          backstory: dom.characterBackstory?.value || "",
          avatarUrl: dom.characterAvatarUrl?.value || ""
        };
      }
      adoptCharacterAsPersona(targetChar, true);
    });
  }

  if (dom.backToPersonaListBtn) {
    dom.backToPersonaListBtn.addEventListener("click", () => {
      const activeId = getActivePersonaId();
      selectAdminPersona(activeId, false);
    });
  }

  if (dom.searchPersonaInput) {
    dom.searchPersonaInput.addEventListener("input", () => {
      renderPersonaList();
    });
  }

  if (dom.personaForm) {
    dom.personaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const id = dom.personaId.value;
      const name = dom.personaNameInput.value.trim();
      const userName = dom.personaUserNameInput.value.trim();
      const userPronouns = dom.personaPronounsSelect.value;
      const description = dom.personaDescriptionInput.value.trim();

      if (!name || !userName) {
        dom.personaFeedback.textContent = "Name and User Name are required.";
        dom.personaFeedback.style.color = "#ef4444";
        return;
      }

      const personas = loadPersonas();
      let persona;
      let isNew = false;

      if (id) {
        persona = personas.find(p => p.id === id);
      }

      if (!persona) {
        isNew = true;
        persona = {
          id: "persona_" + Date.now() + "_" + Math.floor(Math.random() * 1000)
        };
      }

      persona.name = name;
      persona.userName = userName;
      persona.userPronouns = userPronouns;
      persona.description = description;

      if (isNew) {
        personas.push(persona);
      }

      savePersonas(personas);
      setActivePersonaId(persona.id);
      dom.personaId.value = persona.id;
      dom.personaFeedback.textContent = isNew ? "Persona created!" : "Persona saved!";
      dom.personaFeedback.style.color = "var(--accent)";

      selectAdminPersona(persona.id, false);
      window.dispatchEvent(new CustomEvent("persona-changed", { detail: { id: persona.id } }));
    });
  }

  if (dom.deletePersonaBtn) {
    dom.deletePersonaBtn.addEventListener("click", () => {
      const id = dom.personaId.value;
      if (!id) return;

      const personas = loadPersonas();
      if (personas.length <= 1) {
        dom.personaFeedback.textContent = "You must keep at least one persona.";
        dom.personaFeedback.style.color = "#ef4444";
        return;
      }

      if (id === "default_persona") {
        dom.personaFeedback.textContent = "Cannot delete the default persona.";
        dom.personaFeedback.style.color = "#ef4444";
        return;
      }

      const nextPersonas = personas.filter(p => p.id !== id);
      savePersonas(nextPersonas);

      const activeId = getActivePersonaId();
      if (id === activeId) {
        setActivePersonaId("default_persona");
        window.dispatchEvent(new CustomEvent("persona-changed", { detail: { id: "default_persona" } }));
      }

      selectAdminPersona("default_persona", false);
      dom.personaFeedback.textContent = "Persona deleted.";
      dom.personaFeedback.style.color = "var(--accent)";
    });
  }

  window.addEventListener("persona-changed", () => {
    const activePersona = getActivePersona();
    if (activePersona) {
      state.apiSettings.userName = activePersona.userName || "User";
      state.apiSettings.userPronouns = activePersona.userPronouns || "he/him";
      saveApiSettings(state.apiSettings);
      
      if (dom.userNameInput) dom.userNameInput.value = state.apiSettings.userName;
      if (dom.userPronounsSelect) dom.userPronounsSelect.value = state.apiSettings.userPronouns;
      
      renderMessages();
      setStatus(`Switched persona to ${activePersona.name}`);
    }
  });
}

function renderGmParticipantsList() {
  if (!dom.gmCharactersList) return;
  dom.gmCharactersList.innerHTML = "";
  
  state.characters.forEach((char) => {
    const isChecked = state.activeGroupCharacterIds.includes(char.id);
    const item = document.createElement("label");
    item.className = "gm-participant-item";
    item.style.display = "flex";
    item.style.flexDirection = "row";
    item.style.alignItems = "center";
    item.style.gap = "12px";
    item.style.padding = "10px 8px";
    item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    item.style.cursor = "pointer";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = char.id;
    checkbox.checked = isChecked;
    
    const details = document.createElement("div");
    details.innerHTML = `<span style="font-weight: 600; font-size: 13px;">${escapeHtml(char.name)}</span>
                         <span style="font-size: 11px; color: var(--text-muted); display: block;">${escapeHtml(char.description || "No description")}</span>`;
    
    item.appendChild(checkbox);
    item.appendChild(details);
    dom.gmCharactersList.appendChild(item);
  });
}

function attachEvents() {
  registerPersonaEvents();

  if (dom.gmModeToggle) {
    dom.gmModeToggle.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      state.isGmModeEnabled = isChecked;
      
      const character = getActiveCharacter();
      if (character) {
        const activeChatId = getActiveChatId(character.id);
        const chatMeta = (state.chatMetadata[character.id] || []).find(c => c.id === activeChatId);
        if (chatMeta) {
          chatMeta.isGmModeEnabled = isChecked;
          saveChatMetadata(state.chatMetadata);
        }
      }
      
      if (dom.gmSelectParticipantsBtn) {
        dom.gmSelectParticipantsBtn.style.display = isChecked ? "inline-block" : "none";
      }
      setStatus(isChecked ? "GM Scene Mode enabled." : "GM Scene Mode disabled.");
    });
  }

  if (dom.gmSelectParticipantsBtn) {
    dom.gmSelectParticipantsBtn.addEventListener("click", () => {
      renderGmParticipantsList();
      dom.gmParticipantsDialog.showModal();
    });
  }

  if (dom.gmParticipantsConfirmBtn) {
    dom.gmParticipantsConfirmBtn.addEventListener("click", () => {
      const selectedIds = [];
      const checkboxes = dom.gmCharactersList.querySelectorAll("input[type='checkbox']");
      checkboxes.forEach((cb) => {
        if (cb.checked) {
          selectedIds.push(cb.value);
        }
      });
      
      state.activeGroupCharacterIds = selectedIds;
      
      const character = getActiveCharacter();
      if (character) {
        const activeChatId = getActiveChatId(character.id);
        const chatMeta = (state.chatMetadata[character.id] || []).find(c => c.id === activeChatId);
        if (chatMeta) {
          chatMeta.activeGroupCharacterIds = selectedIds;
          saveChatMetadata(state.chatMetadata);
        }
      }
      
      if (dom.gmParticipantCount) {
        dom.gmParticipantCount.textContent = selectedIds.length;
      }
      
      dom.gmParticipantsDialog.close();
      setStatus(`Participants updated: ${selectedIds.length} characters.`);
    });
  }

  if (dom.chatSelector) {
    dom.chatSelector.addEventListener("change", (e) => {
      const isGm = state.sidebarTab === "gm";
      const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
      if (!activeId) return;
      setActiveChatId(activeId, e.target.value);
      if (isGm) {
        switchActiveGmScene(activeId);
      } else {
        switchActiveCharacter(activeId);
      }
    });
  }
  if (dom.newChatBtn) dom.newChatBtn.addEventListener("click", handleNewChat);
  if (dom.newChatUserFirstBtn) dom.newChatUserFirstBtn.addEventListener("click", handleNewChatUserFirst);
  if (dom.duoChatBtn) dom.duoChatBtn.addEventListener("click", handleCreateDuoChat);
  if (dom.convertToGmSceneBtn) dom.convertToGmSceneBtn.addEventListener("click", handleConvertChatToGmScene);
  if (dom.duoCharConfirmBtn) dom.duoCharConfirmBtn.addEventListener("click", handleConfirmDuoChat);
  if (dom.renameChatBtn) dom.renameChatBtn.addEventListener("click", handleRenameChat);
  if (dom.restartChatBtn) dom.restartChatBtn.addEventListener("click", handleRestartChat);
  if (dom.deleteChatBtn) dom.deleteChatBtn.addEventListener("click", handleDeleteChat);

  if (dom.chatForm) dom.chatForm.addEventListener("submit", handleSendMessage);
  if (dom.sendBtn) {
    dom.sendBtn.addEventListener("click", (e) => {
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      handleSendMessage(e);
    });
  }
  if (dom.messageInput) {
    dom.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(e);
      }
    });
    // Auto-grow composer to fit its content (1 -> max lines)
    dom.messageInput.addEventListener("input", autoResizeComposer);
    autoResizeComposer();
  }

  if (dom.attachImageBtn && dom.imageFileInput) {
    dom.attachImageBtn.addEventListener("click", () => {
      dom.imageFileInput.click();
    });
    dom.imageFileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const currentCount = (state.pendingAttachedImages || []).length;
      if (currentCount >= 4) {
        setStatus("Max 4 images per message allowed.");
        e.target.value = "";
        return;
      }

      const filesToProcess = files.slice(0, 4 - currentCount);
      setStatus("Processing image(s)...");

      for (const file of filesToProcess) {
        try {
          const dataUrl = await processImageFile(file);
          if (!state.pendingAttachedImages) state.pendingAttachedImages = [];
          state.pendingAttachedImages.push(dataUrl);
        } catch (err) {
          console.error("Image process error:", err);
          setStatus("Error loading image file.");
        }
      }
      updateImagePreviewUI();
      setStatus("Image attached.");
      e.target.value = "";
    });
  }

  if (dom.closeImageViewerBtn) {
    dom.closeImageViewerBtn.addEventListener("click", () => {
      if (dom.imageViewerModal) dom.imageViewerModal.close();
    });
  }

  initEmojiPicker();
  initSettingsTabs();

  if (dom.openSettingsBtn) {
    dom.openSettingsBtn.addEventListener("click", () => {
      dom.settingsDialog.showModal();
      updateSettingsModelDetails();
    });
  }
  
  if (dom.exportBtn) dom.exportBtn.addEventListener("click", exportData);
  if (dom.importBtn) dom.importBtn.addEventListener("click", () => dom.importFileInput.click());
  if (dom.clearEnvBtn) {
    dom.clearEnvBtn.addEventListener("click", () => {
      if (confirm("Вы уверены, что хотите очистить всю среду и сбросить данные? Это действие нельзя отменить.")) {
        clearEnvironment();
        ensureActiveCharacter();
        switchActiveCharacter(state.activeCharacterId);
        setStatus("Среда успешно очищена.");
      }
    });
  }
  if (dom.importFileInput) dom.importFileInput.addEventListener("change", (e) => {
    const file = e.target?.files?.[0];
    if (file) {
      importDataFromFile(file, () => {
        ensureActiveCharacter();
        switchActiveCharacter(state.activeCharacterId);
        setStatus("Import completed.");
      }, (err) => {
        setStatus("Import failed: invalid JSON");
      });
    }
    e.target.value = "";
  });

  if (dom.undoBtn) dom.undoBtn.addEventListener("click", undo);
  if (dom.redoBtn) dom.redoBtn.addEventListener("click", redo);
  if (dom.moodSelect) dom.moodSelect.addEventListener("change", (e) => handleMoodChange(e.target.value));
  

  
  if (dom.stateForm) dom.stateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const character = getActiveCharacter();
    if (!character) return;
    const key = dom.stateKeyInput.value.trim();
    const value = dom.stateValueInput.value.trim();
    const typeSelect = dom.stateTypeSelect;
    const type = typeSelect ? typeSelect.value : "number";
    if (!key || !value) return;
    
    state.customStateTypes = { ...state.customStateTypes, [key]: type };
    saveCustomStateTypes(state.customStateTypes);
    
    updateStateValue(character.id, key, value);
    
    if (type === "number" && !isBuiltinState(key)) {
      triggerStageGeneration(character, key);
    }
    
    dom.stateKeyInput.value = "";
    dom.stateValueInput.value = "";
  });
  
  if (dom.apiProviderSelect) dom.apiProviderSelect.addEventListener("change", handleProviderChange);
  if (dom.localBaseUrlInput) dom.localBaseUrlInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.localApiKeyInput) dom.localApiKeyInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.nordrouterBaseUrlInput) {
    dom.nordrouterBaseUrlInput.addEventListener("change", async () => {
      syncApiSettingsFromInputs();
      if ((state.apiSettings.apiProvider || "openrouter") === "nordrouter") {
        await loadModels();
      }
    });
  }
  if (dom.nordrouterApiKeyInput) {
    dom.nordrouterApiKeyInput.addEventListener("change", async () => {
      saveNordrouterApiKey(dom.nordrouterApiKeyInput.value);
      syncApiSettingsFromInputs();
      if ((state.apiSettings.apiProvider || "openrouter") === "nordrouter") {
        await loadModels();
      }
    });
  }
  if (dom.customModelInput) {
    dom.customModelInput.addEventListener("input", () => {
      syncApiSettingsFromInputs();
      updateStatsUI();
    });
  }

  if (dom.apiKeyInput) dom.apiKeyInput.addEventListener("change", async () => {
    saveApiKey(dom.apiKeyInput.value);
    await loadModels();
  });
  if (dom.refreshModelsBtn) dom.refreshModelsBtn.addEventListener("click", () => loadModels());
  
  if (dom.modelSelect) {
    dom.modelSelect.addEventListener("change", () => {
      if (dom.customModelInput) {
        dom.customModelInput.value = dom.modelSelect.value;
      }
      syncApiSettingsFromInputs();
      updateStatsUI();
    });
  }

  const handleQuickModelSelect = (prefix) => {
    const result = switchQuickModel(prefix);
    updateStatsUI();
    showStateNotification(`⚡ Активная модель: ${result.friendlyName}`);
  };

  if (dom.quickModelBtnGlm52) {
    dom.quickModelBtnGlm52.addEventListener("click", () => handleQuickModelSelect("5.2"));
  }
  if (dom.quickModelBtnGlm53Flash) {
    dom.quickModelBtnGlm53Flash.addEventListener("click", () => handleQuickModelSelect("5.3"));
  }

  const openModelSettings = () => {
    if (dom.settingsDialog) {
      if (!dom.settingsDialog.open) {
        dom.settingsDialog.showModal();
      }
      if (dom.modelSelect) {
        dom.modelSelect.focus();
      }
    }
  };

  if (dom.sidebarModelActiveName) {
    dom.sidebarModelActiveName.addEventListener("click", openModelSettings);
  }
  if (dom.activeModelBadge) {
    dom.activeModelBadge.addEventListener("click", openModelSettings);
  }
  if (dom.evaluatorModelSelect) {
    dom.evaluatorModelSelect.addEventListener("change", () => {
      if (dom.customEvaluatorModelInput) {
        dom.customEvaluatorModelInput.value = dom.evaluatorModelSelect.value;
      }
      syncApiSettingsFromInputs();
    });
  }
  if (dom.customEvaluatorModelInput) {
    dom.customEvaluatorModelInput.addEventListener("input", syncApiSettingsFromInputs);
  }
  if (dom.translationModelSelect) {
    dom.translationModelSelect.addEventListener("change", () => {
      if (dom.customTranslationModelInput) {
        dom.customTranslationModelInput.value = dom.translationModelSelect.value;
      }
      syncApiSettingsFromInputs();
    });
  }
  if (dom.customTranslationModelInput) {
    dom.customTranslationModelInput.addEventListener("input", syncApiSettingsFromInputs);
  }
  if (dom.jevModelSelect) {
    dom.jevModelSelect.addEventListener("change", () => {
      if (dom.customJevModelInput) {
        dom.customJevModelInput.value = dom.jevModelSelect.value;
      }
      syncApiSettingsFromInputs();
      if (dom.jevActiveModelName) {
        dom.jevActiveModelName.textContent = dom.jevModelSelect.value || (state.apiSettings.apiProvider === "nordrouter" ? "typesafe-ai/jev" : "~typesafe/jev-latest");
      }
    });
  }
  if (dom.customJevModelInput) {
    dom.customJevModelInput.addEventListener("input", () => {
      syncApiSettingsFromInputs();
      if (dom.jevActiveModelName) {
        dom.jevActiveModelName.textContent = dom.customJevModelInput.value.trim() || state.apiSettings.jevModel || (state.apiSettings.apiProvider === "nordrouter" ? "typesafe-ai/jev" : "~typesafe/jev-latest");
      }
    });
  }
  if (dom.temperatureInput) dom.temperatureInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.repetitionPenaltyInput) dom.repetitionPenaltyInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.presencePenaltyInput) dom.presencePenaltyInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.frequencyPenaltyInput) dom.frequencyPenaltyInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.topPInput) dom.topPInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.minPInput) dom.minPInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.maxTokensInput) dom.maxTokensInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.thinkingDisplaySelect) dom.thinkingDisplaySelect.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.enableInnerMonologueInput) dom.enableInnerMonologueInput.addEventListener("change", syncApiSettingsFromInputs);

  // --- Thinking Toggle Button (quick toggle in composer) ---
  if (dom.thinkingToggleBtn) {
    dom.thinkingToggleBtn.addEventListener("click", () => {
      const isCurrentlyEnabled = state.apiSettings?.thinkingDisplay !== "hidden" && state.apiSettings?.enableInnerMonologue !== false;
      const newDisplay = isCurrentlyEnabled ? "hidden" : "collapsed";
      // Update the select in settings panel (if it exists)
      if (dom.thinkingDisplaySelect) {
        dom.thinkingDisplaySelect.value = newDisplay;
      }
      if (dom.enableInnerMonologueInput) {
        dom.enableInnerMonologueInput.checked = !isCurrentlyEnabled;
      }
      // Sync everything through the normal pipeline
      syncApiSettingsFromInputs();
    });
    // Set initial visual state
    updateThinkingToggleVisual();
  }

  if (dom.enableEvaluatorInput) dom.enableEvaluatorInput.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.stabsEdhToggle) dom.stabsEdhToggle.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.enableHiddenTraitsToggle) dom.enableHiddenTraitsToggle.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.userPronounsSelect) dom.userPronounsSelect.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.worldGenreSelect) dom.worldGenreSelect.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.summaryModeSelect) dom.summaryModeSelect.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.maxHistoryMessagesSelect) dom.maxHistoryMessagesSelect.addEventListener("change", syncApiSettingsFromInputs);
  if (dom.responseLengthSelect) {
    dom.responseLengthSelect.addEventListener("change", () => {
      const length = dom.responseLengthSelect.value;
      const lengthTokenMap = {
        short: 400,
        medium: 1000,
        long: 2000,
        huge: 4000
      };
      if (dom.maxTokensInput) {
        dom.maxTokensInput.value = String(lengthTokenMap[length] || 1000);
      }
      syncApiSettingsFromInputs();
    });
  }
  if (dom.chatLanguageSelect) {
    dom.chatLanguageSelect.addEventListener("change", syncApiSettingsFromInputs);
  }
  if (dom.worldGenreSelect) {
    dom.worldGenreSelect.addEventListener("change", syncApiSettingsFromInputs);
  }
  if (dom.chatWorldGenreSelect) {
    dom.chatWorldGenreSelect.addEventListener("change", () => {
      const isGm = state.sidebarTab === "gm";
      const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
      if (!activeId) return;
      const activeChatId = getActiveChatId(activeId);
      const val = dom.chatWorldGenreSelect.value;
      
      state.chatMetadata[activeChatId] = {
        ...(state.chatMetadata[activeChatId] || {}),
        worldGenre: val
      };
      saveChatMetadata(state.chatMetadata);
      
      const genreLabels = {
        fantasy: "🧙‍♂️ Фэнтези / Средневековье",
        modern: "🏙️ Современный мир",
        scifi: "🚀 Научная фантастика",
        cyberpunk: "🌃 Киберпанк",
        any: "🎲 Любой сеттинг"
      };
      showStateNotification(`🌍 Сеттинг чата: ${genreLabels[val] || val}`);
    });
  }
  if (dom.providerSortSelect) {
    dom.providerSortSelect.addEventListener("change", syncApiSettingsFromInputs);
  }
  if (dom.specificProviderSelect) {
    dom.specificProviderSelect.addEventListener("change", syncApiSettingsFromInputs);
  }
  if (dom.specificProviderInput) {
    dom.specificProviderInput.addEventListener("input", syncApiSettingsFromInputs);
  }
  if (dom.allowFallbacksInput) {
    dom.allowFallbacksInput.addEventListener("change", syncApiSettingsFromInputs);
  }
  if (dom.globalSystemPromptInput) dom.globalSystemPromptInput.addEventListener("input", () => {
    state.globalSystemPrompt = dom.globalSystemPromptInput.value;
    saveGlobalSystemPrompt(state.globalSystemPrompt);
  });
  
  if (dom.manageCharactersBtn) dom.manageCharactersBtn.addEventListener("click", () => {
    dom.settingsDialog.close();
    dom.adminDialog.showModal();
    openAdminDialog();
  });

  if (dom.previewPromptBtn) dom.previewPromptBtn.addEventListener("click", () => {
    dom.settingsDialog.close();
    dom.debugDialog.showModal();
    renderDebugLogs();
  });

  if (dom.debugMenuBtn) dom.debugMenuBtn.addEventListener("click", () => {
    dom.settingsDialog.close();
    dom.debugDialog.showModal();
    renderDebugLogs();
  });

  if (dom.testJevBtn) {
    dom.testJevBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      const isNord = apiConfig.apiProvider === "nordrouter";
      const provName = isNord ? "NordRouter" : "OpenRouter";

      if (!apiConfig.apiKey) {
        if (dom.jevTestResult) {
          dom.jevTestResult.style.display = "block";
          dom.jevTestResult.className = "jev-test-result error";
          dom.jevTestResult.textContent = `❌ ${provName} API Key не задан. Укажите ключ в настройках.`;
        }
        return;
      }

      const defaultModel = isNord ? "typesafe-ai/jev" : "~typesafe/jev-latest";
      const targetModel = state.apiSettings.jevModel || defaultModel;

      dom.testJevBtn.disabled = true;
      dom.testJevBtn.textContent = "⏳ Проверка связи...";
      if (dom.jevTestResult) {
        dom.jevTestResult.style.display = "block";
        dom.jevTestResult.className = "jev-test-result";
        dom.jevTestResult.textContent = `Отправка диагностического запроса к ${targetModel} (${provName})...`;
      }

      try {
        const res = await testJevConnection({
          apiKey: apiConfig.apiKey,
          baseUrl: apiConfig.baseUrl,
          apiProvider: apiConfig.apiProvider,
          model: targetModel
        });
        if (dom.jevTestResult) {
          if (res.ok) {
            const probeAns = res.answers?.is_diagnostic_probe;
            const rawProb = typeof probeAns?.probability === "number"
              ? probeAns.probability
              : (typeof probeAns?.noul === "number" ? probeAns.noul : (typeof probeAns?.value === "number" ? probeAns.value : null));
            const prob = rawProb !== null 
              ? `${(rawProb * 100).toFixed(1)}%` 
              : "N/A";
            const costText = (typeof res.costUsd === "number") ? ` • Стоимость: $${res.costUsd}` : "";
            dom.jevTestResult.className = "jev-test-result success";
            dom.jevTestResult.textContent = `✅ Успешно! Модель Jev ответила за ${res.latencyMs}ms. Диагностическая вероятность: ${prob}.${costText}`;
          } else {
            dom.jevTestResult.className = "jev-test-result error";
            dom.jevTestResult.textContent = `❌ Ошибка подключения: ${res.error}`;
          }
        }
      } catch (err) {
        if (dom.jevTestResult) {
          dom.jevTestResult.className = "jev-test-result error";
          dom.jevTestResult.textContent = `❌ Сбой запроса: ${err.message || String(err)}`;
        }
      } finally {
        dom.testJevBtn.disabled = false;
        dom.testJevBtn.textContent = "🧪 Тест связи Jev";
        renderDebugLogs();
      }
    });
  }

  const filterBtns = dom.debugFilterBtns && dom.debugFilterBtns.length > 0 
    ? dom.debugFilterBtns 
    : document.querySelectorAll(".debug-filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeDebugFilter = btn.dataset.filter || "all";
      renderDebugLogs();
    });
  });

  document.addEventListener("jev-api-log", (e) => {
    if (!state.jevLogs) state.jevLogs = [];
    state.jevLogs.unshift(e.detail);
    if (state.jevLogs.length > 50) state.jevLogs.pop();
    if (dom.debugDialog && dom.debugDialog.open) {
      renderDebugLogs();
    }
  });

  document.addEventListener("openrouter-api-log", (e) => {
    state.apiLogs.unshift(e.detail);
    if (state.apiLogs.length > 50) state.apiLogs.pop();
    if (dom.debugDialog && dom.debugDialog.open) {
      renderDebugLogs();
    }

    // Process token usage & costs
    const log = e.detail;
    if (log && log.usage) {
      const modelId = log.model;
      const metadata = state.modelsMetadata?.[modelId];
      const promptTokens = Number(log.usage.prompt_tokens || 0);
      const completionTokens = Number(log.usage.completion_tokens || 0);
      
      let promptPrice = 0;
      let completionPrice = 0;
      const pricingInfo = getEffectiveModelPricing(modelId);
      if (pricingInfo && pricingInfo.promptPrice !== null && pricingInfo.completionPrice !== null) {
        promptPrice = pricingInfo.promptPrice;
        completionPrice = pricingInfo.completionPrice;
      } else if (metadata && metadata.pricing) {
        promptPrice = parseFloat(metadata.pricing.prompt || 0);
        completionPrice = parseFloat(metadata.pricing.completion || 0);
      }

      const cost = (promptTokens * promptPrice) + (completionTokens * completionPrice);
      state.totalSpent = (state.totalSpent || 0) + cost;
      saveTotalSpent(state.totalSpent);

      updateStatsUI(promptTokens, completionTokens, cost);
    } else {
      updateStatsUI();
    }
  });

  if (dom.resetSpentBtn) {
    dom.resetSpentBtn.addEventListener("click", () => {
      state.totalSpent = 0.0;
      saveTotalSpent(0.0);
      updateStatsUI();
    });
  }

  document.addEventListener("openrouter-retry-status", (e) => {
    state.retryStatus = e.detail;
    if (e.detail?.statusText) {
      setStatus(e.detail.statusText);
    }
    renderMessagesThrottled();
  });

  document.addEventListener("openrouter-storage-error", (e) => {
    console.warn(`[Storage Warning] Suppressed quota notification for key "${e.detail.key}":`, e.detail.error);
  });

  if (dom.startWizardBtn) dom.startWizardBtn.addEventListener("click", startCharacterWizard);
  if (dom.startRefineWizardBtn) dom.startRefineWizardBtn.addEventListener("click", startCharacterRefineWizard);
  if (dom.characterRefineSendBtn) dom.characterRefineSendBtn.addEventListener("click", () => handleRefineWizardInput(upsertCharacterFromForm));
  if (dom.characterRefineInput) {
    dom.characterRefineInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleRefineWizardInput(upsertCharacterFromForm);
      }
    });
  }
  if (dom.wizardSendBtn) dom.wizardSendBtn.addEventListener("click", () => handleWizardInput((newId) => {
    switchActiveCharacter(newId);
    selectAdminCharacter(newId);
  }));
  if (dom.wizardInput) {
    dom.wizardInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleWizardInput((newId) => {
          switchActiveCharacter(newId);
          selectAdminCharacter(newId);
        });
      }
    });
  }
  if (dom.wizardModelSelect) {
    dom.wizardModelSelect.addEventListener("change", () => {
      state.wizardModel = dom.wizardModelSelect.value;
    });
  }
  
  if (dom.saveCharacterBtn) dom.saveCharacterBtn.addEventListener("click", (event) => {
    event.preventDefault();
    upsertCharacterFromForm();
  });
  
  if (dom.characterForm) dom.characterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    upsertCharacterFromForm();
  });
  if (dom.deleteCharacterBtn) dom.deleteCharacterBtn.addEventListener("click", deleteSelectedCharacter);
  
  if (dom.addCoreStateBtn) {
    dom.addCoreStateBtn.addEventListener("click", () => {
      const card = createCoreStateEditorCard();
      dom.coreStatesList.appendChild(card);
    });
  }

  // Bind Add LoreBook Entry Button
  if (dom.addLoreEntryBtn) {
    dom.addLoreEntryBtn.addEventListener("click", () => {
      const card = createLoreBookEditorCard();
      dom.loreBookList.appendChild(card);
    });
  }

  // Bind Memory Manager Events
  if (dom.addPinnedFactForm) {
    dom.addPinnedFactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = dom.newPinnedFactInput?.value?.trim();
      if (!val) return;

      const isGm = state.sidebarTab === "gm";
      const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
      if (!activeId) return;

      const activeChatId = getActiveChatId(activeId);
      const allPinned = loadPinnedFacts();
      const currentList = allPinned[activeChatId] || [];
      currentList.push(val);
      allPinned[activeChatId] = currentList;
      savePinnedFacts(allPinned);

      if (dom.newPinnedFactInput) dom.newPinnedFactInput.value = "";
      renderMemoryManager();
      setStatus("Pinned fact added.");
    });
  }

  if (dom.saveSummaryBtn) {
    dom.saveSummaryBtn.addEventListener("click", () => {
      const val = dom.storySummaryInput?.value?.trim() || "";
      const isGm = state.sidebarTab === "gm";
      const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
      if (!activeId) return;

      const activeChatId = getActiveChatId(activeId);
      state.chatSummaries[activeChatId] = val;
      saveChatSummaries(state.chatSummaries);
      setStatus("Story summary saved.");
    });
  }

  if (dom.recalcMemoryBtn) {
    dom.recalcMemoryBtn.addEventListener("click", async () => {
      const isGm = state.sidebarTab === "gm";
      const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
      if (!activeId) return;

      const activeChatId = getActiveChatId(activeId);
      const character = isGm ? null : getActiveCharacter();
      setStatus("Summarizing chat history...");
      
      state.chatSummarizedMessageCount[activeChatId] = 0;
      await summarizeChatHistoryBackground(character, activeChatId);
      renderMemoryManager();
      setStatus("Story summary updated!");
    });
  }

  if (dom.characterSearchInput) dom.characterSearchInput.addEventListener("input", () => {
    state.charQuery = dom.characterSearchInput.value || "";
    renderCharacters();
  });

  if (dom.quickCreateCharBtn) {
    dom.quickCreateCharBtn.addEventListener("click", () => {
      openAdminDialog();
    });
  }

  if (dom.quickImportCharBtn) {
    dom.quickImportCharBtn.addEventListener("click", () => {
      dom.characterCardFileInput?.click();
    });
  }

  if (dom.adminImportCardBtn) {
    dom.adminImportCardBtn.addEventListener("click", () => {
      dom.characterCardFileInput?.click();
    });
  }

  if (dom.studioImportCardBtn) {
    dom.studioImportCardBtn.addEventListener("click", () => {
      dom.characterCardFileInput?.click();
    });
  }

  if (dom.characterCardFileInput) {
    dom.characterCardFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleCardFile(file);
      e.target.value = "";
    });
  }

  if (dom.closeCardImportBtn) {
    dom.closeCardImportBtn.addEventListener("click", () => {
      if (dom.cardImportDialog) dom.cardImportDialog.close();
    });
  }

  if (dom.cardImportCancelBtn) {
    dom.cardImportCancelBtn.addEventListener("click", () => {
      if (dom.cardImportDialog) dom.cardImportDialog.close();
    });
  }

  if (dom.cardImportAdaptBtn) {
    dom.cardImportAdaptBtn.addEventListener("click", () => {
      executeCardAdaptation();
    });
  }

  if (dom.cardImportAsIsBtn) {
    dom.cardImportAsIsBtn.addEventListener("click", () => {
      executeCardImportAsIs();
    });
  }

  // --- Character Enhancer Listeners (with 18+ Mode) ---
  if (dom.startCharacterEnhancerBtn) {
    dom.startCharacterEnhancerBtn.addEventListener("click", () => {
      const charId = dom.characterId?.value;
      const existing = state.characters.find(c => c.id === charId) || {};
      
      const charData = {
        id: charId || existing.id || `char_${Date.now()}`,
        name: dom.characterName?.value?.trim() || existing.name || "Персонаж",
        gender: dom.characterGender?.value || existing.gender || "she/her",
        description: dom.characterDescription?.value?.trim() || existing.description || "",
        appearance: dom.characterAppearance?.value?.trim() || existing.appearance || "",
        behavior: dom.characterBehavior?.value?.trim() || existing.behavior || dom.characterPersonality?.value?.trim() || existing.personality || "",
        backstory: dom.characterBackstory?.value?.trim() || existing.backstory || "",
        speech: dom.characterSpeech?.value?.trim() || existing.speech || "",
        scenario: dom.characterScenario?.value?.trim() || existing.scenario || "",
        firstMessage: dom.characterFirstMessage?.value?.trim() || existing.firstMessage || "",
        traits: dom.characterTraits?.value ? dom.characterTraits.value.split(",").map(t => t.trim()).filter(Boolean) : (existing.traits || []),
        hiddenTraits: dom.characterHiddenTraits?.value ? dom.characterHiddenTraits.value.split(",").map(t => t.trim()).filter(Boolean) : (existing.hiddenTraits || []),
        avatarUrl: dom.characterAvatarUrl?.value?.trim() || existing.avatarUrl || existing.avatar || existing.image || "",
        coreStates: existing.coreStates || [],
        lorebook: existing.lorebook || []
      };

      openCharacterEnhancerDialog(charData);
    });
  }

  if (dom.chatHeaderEnhanceBtn) {
    dom.chatHeaderEnhanceBtn.addEventListener("click", () => {
      if (!state.activeCharacterId) return;
      const character = state.characters.find(c => c.id === state.activeCharacterId);
      if (!character) return;
      openCharacterEnhancerDialog(character);
    });
  }

  if (dom.closeCharacterEnhancerBtn) {
    dom.closeCharacterEnhancerBtn.addEventListener("click", () => {
      if (dom.characterEnhancerDialog) dom.characterEnhancerDialog.close();
    });
  }

  if (dom.enhancerCancelBtn) {
    dom.enhancerCancelBtn.addEventListener("click", () => {
      if (dom.characterEnhancerDialog) dom.characterEnhancerDialog.close();
    });
  }

  if (dom.enhancerNsfwToggle) {
    dom.enhancerNsfwToggle.addEventListener("change", () => {
      const isChecked = dom.enhancerNsfwToggle.checked;
      if (dom.enhancerNsfwBadge) {
        dom.enhancerNsfwBadge.style.display = isChecked ? "inline-block" : "none";
      }
      if (dom.enhancerPresetSelect) {
        if (isChecked) {
          dom.enhancerPresetSelect.value = "romance";
        } else if (dom.enhancerPresetSelect.value === "romance") {
          dom.enhancerPresetSelect.value = "balanced";
        }
      }
    });
  }

  if (dom.enhancerSubmitBtn) {
    dom.enhancerSubmitBtn.addEventListener("click", () => {
      executeCharacterEnhancement();
    });
  }

  if (dom.enhancerApplyBtn) {
    dom.enhancerApplyBtn.addEventListener("click", () => {
      applyCharacterEnhancements();
    });
  }

  // --- Character Catalog Listeners ---
  if (dom.openCatalogBtn) {
    dom.openCatalogBtn.addEventListener("click", () => {
      openCharacterCatalogDialog();
    });
  }
  if (dom.openCatalogBannerBtn) {
    dom.openCatalogBannerBtn.addEventListener("click", () => {
      openCharacterCatalogDialog();
    });
  }
  if (dom.closeCatalogDialogBtn) {
    dom.closeCatalogDialogBtn.addEventListener("click", () => {
      if (dom.characterCatalogDialog) dom.characterCatalogDialog.close();
    });
  }

  // Auto-close modal dialogs when clicking on backdrop
  document.querySelectorAll("dialog").forEach((dlg) => {
    dlg.addEventListener("click", (evt) => {
      if (evt.target !== dlg) return;
      const rect = dlg.getBoundingClientRect();
      const isInDialog = (
        rect.top <= evt.clientY &&
        evt.clientY <= rect.top + rect.height &&
        rect.left <= evt.clientX &&
        evt.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        dlg.close();
      }
    });
  });

  // Tabs switching
  if (dom.catalogTabCuratedBtn) {
    dom.catalogTabCuratedBtn.addEventListener("click", () => switchCatalogTab("curated"));
  }
  if (dom.catalogTabChubBtn) {
    dom.catalogTabChubBtn.addEventListener("click", () => switchCatalogTab("chub"));
  }
  if (dom.catalogTabUrlBtn) {
    dom.catalogTabUrlBtn.addEventListener("click", () => switchCatalogTab("url"));
  }

  // Curated genre filter chips
  if (dom.curatedGenreChips) {
    dom.curatedGenreChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".genre-chip");
      if (!chip) return;
      const genre = chip.getAttribute("data-genre");
      if (!genre) return;

      dom.curatedGenreChips.querySelectorAll(".genre-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentGenreFilter = genre;
      renderCuratedCatalog();
    });
  }

  // Curated search input
  if (dom.curatedSearchInput) {
    dom.curatedSearchInput.addEventListener("input", () => {
      renderCuratedCatalog();
    });
  }

  // Chub AI search input (debounce 400ms)
  if (dom.chubSearchInput) {
    dom.chubSearchInput.addEventListener("input", () => {
      clearTimeout(chubSearchDebounceTimer);
      chubSearchDebounceTimer = setTimeout(() => {
        performChubSearch(dom.chubSearchInput.value, 1, true);
      }, 400);
    });

    dom.chubSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(chubSearchDebounceTimer);
        performChubSearch(dom.chubSearchInput.value, 1, true);
      }
    });
  }

  if (dom.chubSearchSubmitBtn) {
    dom.chubSearchSubmitBtn.addEventListener("click", () => {
      clearTimeout(chubSearchDebounceTimer);
      performChubSearch(dom.chubSearchInput?.value || "", 1, true);
    });
  }

  if (dom.chubSortSelect) {
    dom.chubSortSelect.addEventListener("change", () => {
      performChubSearch(dom.chubSearchInput?.value || "", 1, true);
    });
  }

  if (dom.chubNsfwToggle) {
    dom.chubNsfwToggle.addEventListener("change", () => {
      performChubSearch(dom.chubSearchInput?.value || "", 1, true);
    });
  }

  if (dom.chubRetryBtn) {
    dom.chubRetryBtn.addEventListener("click", () => {
      performChubSearch(dom.chubSearchInput?.value || "", currentChubPage, true);
    });
  }

  // Chub pagination controls
  if (dom.chubPrevPageBtn) {
    dom.chubPrevPageBtn.addEventListener("click", () => {
      if (currentChubPage > 1) {
        performChubSearch(currentChubQuery, currentChubPage - 1, true);
      }
    });
  }

  if (dom.chubNextPageBtn) {
    dom.chubNextPageBtn.addEventListener("click", () => {
      if (currentChubPage < totalChubPages) {
        performChubSearch(currentChubQuery, currentChubPage + 1, true);
      }
    });
  }

  // Tab 3: URL import
  if (dom.chubUrlDownloadBtn) {
    dom.chubUrlDownloadBtn.addEventListener("click", () => {
      handleChubUrlDownload();
    });
  }

  if (dom.chubUrlInput) {
    dom.chubUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        handleChubUrlDownload();
      }
    });
  }

  // Tab 3: Dropzone & File Selection
  if (dom.catalogSelectFileBtn) {
    dom.catalogSelectFileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dom.catalogFileInput?.click();
    });
  }

  if (dom.catalogDropZone) {
    dom.catalogDropZone.addEventListener("click", () => {
      dom.catalogFileInput?.click();
    });

    dom.catalogDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.catalogDropZone.classList.add("dragover");
    });

    dom.catalogDropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.catalogDropZone.classList.remove("dragover");
    });

    dom.catalogDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.catalogDropZone.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        if (dom.characterCatalogDialog) dom.characterCatalogDialog.close();
        handleCardFile(file);
      }
    });
  }

  if (dom.catalogFileInput) {
    dom.catalogFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        if (dom.characterCatalogDialog) dom.characterCatalogDialog.close();
        handleCardFile(file);
      }
      e.target.value = "";
    });
  }

  // Global Drag and Drop support for character card files
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer?.types?.includes("Files")) {
      document.body.classList.add("drag-drop-zone-active");
    }
  });

  window.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
      document.body.classList.remove("drag-drop-zone-active");
    }
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("drag-drop-zone-active");
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".png") || name.endsWith(".json") || name.endsWith(".chub") || name.endsWith(".card")) {
        handleCardFile(file);
      }
    }
  });

  if (dom.editCharacterBtn) {
    dom.editCharacterBtn.addEventListener("click", () => {
      if (state.sidebarTab === "gm") {
        if (state.activeGmSceneId) {
          openGmSceneDialog(state.activeGmSceneId);
        }
      } else {
        const character = getActiveCharacter();
        if (character) {
          selectAdminCharacter(character.id);
          dom.adminDialog.showModal();
        }
      }
    });
  }

  document.addEventListener("keydown", handleHotkey);

  if (dom.toggleSidebarRightBtn) {
    dom.toggleSidebarRightBtn.addEventListener("click", () => {
      if (dom.sidebarRight) {
        const isHidden = window.getComputedStyle(dom.sidebarRight).display === "none";
        const willShow = isHidden;
        dom.sidebarRight.style.display = willShow ? "flex" : "none";
        if (willShow) {
          dom.sidebarRight.classList.remove("collapsed");
          dom.sidebarRight.classList.add("expanded");
          if (dom.app) dom.app.classList.add("sidebar-right-active");
        } else {
          dom.sidebarRight.classList.remove("expanded");
          dom.sidebarRight.classList.add("collapsed");
          if (dom.app) dom.app.classList.remove("sidebar-right-active");
        }
        localStorage.setItem("show_sidebar_right", willShow ? "true" : "false");
      }
    });
  }

  if (dom.closeSidebarRightBtn) {
    dom.closeSidebarRightBtn.addEventListener("click", () => {
      if (dom.sidebarRight) {
        dom.sidebarRight.style.display = "none";
        dom.sidebarRight.classList.remove("expanded");
        dom.sidebarRight.classList.add("collapsed");
        if (dom.app) dom.app.classList.remove("sidebar-right-active");
        localStorage.setItem("show_sidebar_right", "false");
      }
    });
  }

  // Right Sidebar Segmented Tabs
  if (dom.sidebarRightTabs) {
    dom.sidebarRightTabs.addEventListener("click", (e) => {
      const tabBtn = e.target.closest(".sidebar-tab-btn");
      if (tabBtn && tabBtn.dataset.tab) {
        switchRightSidebarTab(tabBtn.dataset.tab);
      }
    });

    const savedRightTab = localStorage.getItem("active_right_sidebar_tab") || "memory";
    switchRightSidebarTab(savedRightTab);
  }

  if (dom.toggleSidebarLeftBtn) {
    dom.toggleSidebarLeftBtn.addEventListener("click", () => {
      if (dom.sidebarLeft && dom.sidebarLeftBackdrop) {
        dom.sidebarLeft.classList.toggle("active");
        dom.sidebarLeftBackdrop.classList.toggle("active");
      }
    });
  }

  if (dom.sidebarLeftBackdrop) {
    dom.sidebarLeftBackdrop.addEventListener("click", () => {
      if (dom.sidebarLeft && dom.sidebarLeftBackdrop) {
        dom.sidebarLeft.classList.remove("active");
        dom.sidebarLeftBackdrop.classList.remove("active");
      }
    });
  }

  const moreBtn = dom.chatMoreActionsBtn || document.getElementById("chatMoreActionsBtn");
  const dropdown = dom.chatActionsDropdown || document.getElementById("chatActionsDropdown");

  if (moreBtn && dropdown) {
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      dropdown.classList.toggle("active");
    };

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && !moreBtn.contains(e.target)) {
        dropdown.classList.remove("active");
      }
    });

    dropdown.addEventListener("click", (e) => {
      if (e.target.closest(".switch") || e.target.closest("#duoModeToggle")) {
        return;
      }
      if (e.target.closest(".dropdown-item")) {
        dropdown.classList.remove("active");
      }
    });
  }

  if (dom.clearEventLogBtn) {
    dom.clearEventLogBtn.addEventListener("click", () => {
      const character = getActiveCharacter();
      if (!character) return;
      
      const activeChatId = getActiveChatId(character.id);
      const states = getChatStates(activeChatId);
      state.chatStates = {
        ...state.chatStates,
        [activeChatId]: {
          ...states,
          eventLog: []
        }
      };
      saveChatStates(state.chatStates);
      renderEventLog();
      setStatus("Relationship log cleared.");
    });
  }

  // --- Bind Prompt Wizard Events ---
  if (dom.startPromptWizardBtn) {
    dom.startPromptWizardBtn.addEventListener("click", startPromptWizard);
  }
  if (dom.promptWizardSendBtn) {
    dom.promptWizardSendBtn.addEventListener("click", handlePromptWizardInput);
  }
  if (dom.promptWizardInput) {
    dom.promptWizardInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handlePromptWizardInput();
      }
    });
  }

  // --- Bind AI Refiner Events ---
  if (dom.aiRefineBtn) {
    dom.aiRefineBtn.addEventListener("click", () => {
      if (dom.aiRefinerInstruction) {
        refineCharacterProfile(dom.aiRefinerInstruction.value.trim());
      }
    });
  }
  if (dom.aiRefinerInstruction) {
    dom.aiRefinerInstruction.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        refineCharacterProfile(dom.aiRefinerInstruction.value.trim());
      }
    });
  }

  // --- Bind GM Scene Mode Events ---
  if (dom.tabCharactersBtn) {
    dom.tabCharactersBtn.addEventListener("click", () => {
      switchSidebarTab("characters");
      saveSidebarTab("characters");
      if (state.activeCharacterId) {
        switchActiveCharacter(state.activeCharacterId);
      }
    });
  }
  if (dom.tabGmScenesBtn) {
    dom.tabGmScenesBtn.addEventListener("click", () => {
      switchSidebarTab("gm");
      saveSidebarTab("gm");
      ensureActiveGmScene();
      if (state.activeGmSceneId) {
        switchActiveGmScene(state.activeGmSceneId);
      } else {
        renderGmScenes();
        renderMessages();
      }
    });
  }
  if (dom.createGmSceneBtn) {
    dom.createGmSceneBtn.addEventListener("click", () => openGmSceneDialog(null));
  }
  if (dom.gmSceneSearchInput) {
    dom.gmSceneSearchInput.addEventListener("input", renderGmScenes);
  }
  if (dom.gmSceneSaveBtn) {
    dom.gmSceneSaveBtn.addEventListener("click", saveGmScene);
  }
  if (dom.gmSceneDeleteBtn) {
    dom.gmSceneDeleteBtn.addEventListener("click", deleteGmScene);
  }
  const gmQuickEditSceneBtn = document.getElementById("gmQuickEditSceneBtn");
  if (gmQuickEditSceneBtn) {
    gmQuickEditSceneBtn.addEventListener("click", () => {
      if (state.activeGmSceneId) {
        openGmSceneDialog(state.activeGmSceneId);
      }
    });
  }
  if (dom.gmSceneAddNpcBtn) {
    dom.gmSceneAddNpcBtn.addEventListener("click", () => openNpcEditDialog(null));
  }
  if (dom.gmSceneImportNpcBtn) {
    dom.gmSceneImportNpcBtn.addEventListener("click", openImportNpcDialog);
  }
  if (dom.gmSceneImportConfirmBtn) {
    dom.gmSceneImportConfirmBtn.addEventListener("click", confirmImportNpc);
  }
  if (dom.gmNpcSaveBtn) {
    dom.gmNpcSaveBtn.addEventListener("click", saveNpc);
  }
  
  onSelectGmScene((sceneId) => {
    switchActiveGmScene(sceneId);
  });
  onEditGmScene((sceneId) => {
    openGmSceneDialog(sceneId);
  });
}

function handleAddStatusCondition(charId, cond) {
  const activeChatId = getActiveChatId(state.activeCharacterId);
  if (!activeChatId) {
    console.warn("[StatusCondition] No active chat ID found for", state.activeCharacterId);
    return;
  }
  
  const currentStates = { ...getChatStates(activeChatId) };
  console.log("[StatusCondition] Adding condition:", { charId, cond, activeChatId });
  
  if (!currentStates.statusConditions) {
    currentStates.statusConditions = {};
  }
  if (!currentStates.statusConditions[charId]) {
    currentStates.statusConditions[charId] = [];
  }
  if (!currentStates.statusConditions[charId].map(c => c.trim()).includes(cond.trim())) {
    currentStates.statusConditions[charId].push(cond);
  }
  
  state.chatStates[activeChatId] = currentStates;
  saveChatStates(state.chatStates);
  renderStates();
  renderProgressBar();
  setStatus(`Status condition "${cond}" added to character.`);
}

function handleRemoveStatusCondition(charId, cond) {
  const activeChatId = getActiveChatId(state.activeCharacterId);
  if (!activeChatId) {
    console.warn("[StatusCondition] No active chat ID found for", state.activeCharacterId);
    return;
  }
  
  const currentStates = { ...getChatStates(activeChatId) };
  console.log("[StatusCondition] Attempting to remove condition:", { charId, cond, activeChatId });
  console.log("[StatusCondition] Current statusConditions:", currentStates.statusConditions);
  
  if (currentStates.statusConditions && currentStates.statusConditions[charId]) {
    const beforeLength = currentStates.statusConditions[charId].length;
    currentStates.statusConditions[charId] = currentStates.statusConditions[charId].filter(c => c.trim() !== cond.trim());
    const afterLength = currentStates.statusConditions[charId].length;
    console.log("[StatusCondition] Filtered from", beforeLength, "to", afterLength, "items");
  } else {
    console.warn("[StatusCondition] No conditions found for character:", charId);
  }
  
  state.chatStates[activeChatId] = currentStates;
  saveChatStates(state.chatStates);
  renderStates();
  renderProgressBar();
  setStatus(`Status condition "${cond}" removed from character.`);
}

// --- Bind UI callbacks ---
function registerCallbacks() {
  onTriggerStageGeneration((character, stateKey) => triggerStageGeneration(character, stateKey));
  onApplyProposal((index, proposal) => handleApplyProposal(index, proposal));
  onDismissProposal((index, proposal) => handleDismissProposal(index, proposal));
  onGenerateStages((character, stateKey) => generateStagesForState(character, stateKey));
  onAddStatusCondition((charId, cond) => handleAddStatusCondition(charId, cond));
  onRemoveStatusCondition((charId, cond) => handleRemoveStatusCondition(charId, cond));
  onEditMessage((msgIndex, newContent) => handleEditMessage(msgIndex, newContent));
  onReplyMessage((msgIndex) => handleReply(msgIndex));
  onDeleteMessage((msgIndex) => handleDeleteMessage(msgIndex));
  onReactionChange((msgIndex, reaction) => handleReaction(msgIndex, reaction));
  onSelectCharacter((charId, isSyncOnly) => {
    if (isSyncOnly) {
      ensureActiveCharacter();
      return;
    }
    switchActiveCharacter(charId);
    if (dom.sidebarLeft && dom.sidebarLeftBackdrop) {
      dom.sidebarLeft.classList.remove("active");
      dom.sidebarLeftBackdrop.classList.remove("active");
    }
  });
  window.selectCharacter = (charId) => switchActiveCharacter(charId);
  onBuildSystemContext((character, userInput) => {
    const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";
    const activePersona = getActivePersona();
    const userName = activePersona ? (activePersona.userName || "User") : "User";
    const isGm = state.sidebarTab === "gm";
    let res = isGm ? buildGroupScenePrompt(userInput) : buildSystemContext(character, userInput);
    if (state.apiSettings?.stabsEdhEnabled !== false) {
      res += "\n\n=== STAB'S EDH DIRECTIVES (ACTIVE) ===\n" + getStabsEdhPrompt(isRu, userName, isGm);
    }
    return res;
  });
  onInlineRegenerate((msgIndex) => handleInlineRegenerate(msgIndex));
  onGenerateLoreTriggers((topic, detail) => generateLoreTriggers(topic, detail));
  onImproveLoreContent((topic, currentContent) => improveLoreContent(topic, currentContent));
  onRefineCharacter((instruction) => refineCharacterProfile(instruction));
}

// --- React to state.js updates ---
function registerStateObserver() {
  onStateChange(({ action, message }) => {
    renderStates();
    renderProgressBar();
    renderMoodIndicator();
    renderStateProposals();
    if (action === "state_reverted" || action === "state_restored" || action === "proposal_reverted" || action === "proposal_restored") {
      showStateNotification(message);
    }
    setStatus(message);
  });
  onTraitModifier((character, key, value) => modifyValueByTraits(character, key, value));
}

function handleReaction(msgIndex, reaction) {
  const character = getActiveCharacter();
  if (!character) return;

  const activeChatId = getActiveChatId(character.id);
  const chat = [...(state.chats[activeChatId] || [])];
  if (msgIndex < 0 || msgIndex >= chat.length) return;

  chat[msgIndex] = { ...chat[msgIndex], reaction };
  state.chats = { ...state.chats, [activeChatId]: chat };
  saveChats(state.chats);
  renderMessages();
  setStatus(reaction ? `Reaction set to ${reaction}` : "Reaction cleared.");
}

function handleReply(msgIndex) {
  const character = getActiveCharacter();
  if (!character) return;

  const chat = state.chats[getActiveChatId(character.id)] || [];
  const quoted = chat[msgIndex];
  if (!quoted) return;

  state.replyingToMessageIndex = msgIndex;
  dom.messageInput.value = `> ${quoted.content}\n`;
  autoResizeComposer();
  dom.messageInput.focus();
}

function handleEditMessage(msgIndex, newContent) {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  const chat = [...(state.chats[activeChatId] || [])];
  const msg = chat[msgIndex];
  if (!msg || (msg.role !== "user" && msg.role !== "assistant")) return;

  if (newContent === null || newContent === undefined || newContent === msg.content) return;

  chat[msgIndex] = { ...msg, content: newContent, edited: true };
  state.chats = { ...state.chats, [activeChatId]: chat };
  saveChats(state.chats);
  renderMessages();
  
  if (msg.role === "user" && !isGm) {
    setStatus("Message edited. Regenerating response...");
    handleInlineRegenerate(msgIndex + 1);
  } else {
    setStatus("Message edited.");
  }
}

function handleDeleteMessage(msgIndex) {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  const chat = state.chats[activeChatId] || [];
  if (msgIndex < 0 || msgIndex >= chat.length) return;

  const newChat = chat.filter((_, i) => i !== msgIndex);
  state.chats = { ...state.chats, [activeChatId]: newChat };
  saveChats(state.chats);
  
  // Clear summary only if the entire chat was emptied
  if (newChat.length === 0) {
    delete state.chatSummaries[activeChatId];
    delete state.chatSummarizedMessageCount[activeChatId];
    saveChatSummaries(state.chatSummaries);
    saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
  }

  renderMessages();
  updateStatsUI();
  setStatus("Message deleted.");
}

function handleApplyProposal(index, proposal) {
  const character = getActiveCharacter();
  if (!character) return;
  const activeChatId = getActiveChatId(character.id);
  const proposals = state.pendingStateProposals[activeChatId] || [];
  if (index < 0 || index >= proposals.length) return;

  const originalValue = getChatStates(activeChatId)[proposal.key];
  const type = getStateType(proposal.key, state.customStateTypes);
  
  const modified = modifyValueByTraits(character, proposal.key, proposal.value);
  
  let newValue;
  if (type === "number") {
    const orig = typeof originalValue === "number" ? originalValue : (BUILTIN_STATES[proposal.key]?.default ?? 0);
    newValue = orig + modified.value;
  } else {
    newValue = modified.value;
  }
  
  const normalized = normalizeStateValue(type, newValue, proposal.key);

  state.chatStates[activeChatId] = {
    ...getChatStates(activeChatId),
    [proposal.key]: normalized
  };
  
  const removedProposal = proposals.filter((_, i) => i !== index);
  state.pendingStateProposals[activeChatId] = removedProposal;
  
  const finalProposal = { ...proposal, value: normalized };
  pushAction("proposal_apply", { characterId: activeChatId, proposal: finalProposal, index: index, oldValue: originalValue }, { action: "proposal_dismiss", index: index });
  saveChatStates(state.chatStates);

  const diff = typeof normalized === 'number' && typeof originalValue === 'number' ? normalized - originalValue : 0;
  let logMsg = "";
  if (typeof normalized === 'number') {
    const sign = diff >= 0 ? "+" : "";
    logMsg = `${proposal.key.toUpperCase()} updated: ${sign}${diff} (New: ${normalized})${modified.explanation}`;
  } else {
    logMsg = `${proposal.key.toUpperCase()} changed from "${originalValue}" to "${normalized}"`;
  }
  if (proposal.reason) {
    logMsg += ` | Reason: ${proposal.reason}`;
  }
  addEventLogEntry(activeChatId, logMsg);

  renderStates();
  renderStateProposals();
  renderProgressBar();
  renderMoodIndicator();
  showStateNotification(`Suggested state applied: ${proposal.key} = ${normalized}`);
  setStatus(`Applied suggested state: ${proposal.key}.`);
}

// Resolved shadowed parameter in dismiss proposal
function handleDismissProposal(index, proposal) {
  const character = getActiveCharacter();
  if (!character) return;
  const activeChatId = getActiveChatId(character.id);
  const proposals = state.pendingStateProposals[activeChatId] || [];
  if (index < 0 || index >= proposals.length) return;

  const filtered = proposals.filter((_, i) => i !== index);
  state.pendingStateProposals[activeChatId] = filtered;
  pushAction("proposal_dismiss", { characterId: activeChatId, proposal, index: index }, { action: "proposal_apply", index: index });
  renderStateProposals();
  setStatus("Suggestion dismissed.");
}

function bootstrap() {
  state.characters = loadCharacters(defaultCharacters);
  state.chats = loadChats();
  state.globalSystemPrompt = loadGlobalSystemPrompt();
  if (dom.globalSystemPromptInput) dom.globalSystemPromptInput.value = state.globalSystemPrompt;
  state.chatStates = loadChatStates();
  
  migrateDataToMultiChat();
  
  console.log("[StateSystem] Loaded states:", state.chatStates);

  state.apiSettings = loadApiSettings();
  const activePersona = getActivePersona();
  if (activePersona) {
    state.apiSettings.userName = activePersona.userName || "User";
    state.apiSettings.userPronouns = activePersona.userPronouns || "he/him";
  }
  state.models = loadModelsCache();
  state.modelsMetadata = loadModelsMetadataCache();
  state.totalSpent = loadTotalSpent();

  const provider = state.apiSettings.apiProvider || "openrouter";
  const defaultLocalUrl = provider === "kobold" ? "http://localhost:5001" : "http://localhost:1234/v1";
  if (dom.apiProviderSelect) dom.apiProviderSelect.value = provider;
  if (dom.localBaseUrlInput) dom.localBaseUrlInput.value = state.apiSettings.localBaseUrl || defaultLocalUrl;
  if (dom.localApiKeyInput) dom.localApiKeyInput.value = state.apiSettings.localApiKey || "lm-studio";
  if (dom.nordrouterApiKeyInput) dom.nordrouterApiKeyInput.value = state.apiSettings.nordrouterApiKey || loadNordrouterApiKey() || "";
  if (dom.nordrouterBaseUrlInput) dom.nordrouterBaseUrlInput.value = state.apiSettings.nordrouterBaseUrl || "https://nordrouter.com/v1";
  updateProviderUI();
  if (dom.customModelInput) dom.customModelInput.value = state.apiSettings.selectedModel || "";
  if (dom.userNameInput) dom.userNameInput.value = state.apiSettings.userName;
  if (dom.userPronounsSelect) dom.userPronounsSelect.value = state.apiSettings.userPronouns;
  if (dom.responseLengthSelect) dom.responseLengthSelect.value = state.apiSettings.responseLength || "medium";
  if (dom.chatLanguageSelect) dom.chatLanguageSelect.value = state.apiSettings.chatLanguage || "ru";
  if (dom.worldGenreSelect) dom.worldGenreSelect.value = state.apiSettings.worldGenre || "fantasy";
  if (dom.stabsEdhToggle) dom.stabsEdhToggle.checked = state.apiSettings.stabsEdhEnabled !== false;


  if (dom.apiKeyInput) dom.apiKeyInput.value = loadApiKey();

  state.activeCharacterId = localStorage.getItem("openrouter_active_character_id_v1") || "";
  ensureActiveCharacter();
  ensureActiveGmScene();
  
  state.promptWizardMessages = [];
  
  registerCallbacks();
  registerStateObserver();
  
  switchSidebarTab(state.sidebarTab || "characters");
  if (state.sidebarTab === "gm") {
    if (state.activeGmSceneId) {
      switchActiveGmScene(state.activeGmSceneId);
    } else {
      renderGmScenes();
      renderMessages();
    }
  } else {
    switchActiveCharacter(state.activeCharacterId);
  }
  
  attachEvents();

  loadPersonas();
  renderPersonaList();

  loadModels({ silent: true });

  syncStorageFromIndexedDB(state, () => {
    renderCharacterList();
    renderMessages();
  });

  const showSidebar = localStorage.getItem("show_sidebar_right") === "true";
  if (dom.sidebarRight) {
    dom.sidebarRight.style.display = showSidebar ? "flex" : "none";
    if (showSidebar) {
      dom.sidebarRight.classList.remove("collapsed");
      dom.sidebarRight.classList.add("expanded");
      if (dom.app) dom.app.classList.add("sidebar-right-active");
    } else {
      dom.sidebarRight.classList.remove("expanded");
      dom.sidebarRight.classList.add("collapsed");
      if (dom.app) dom.app.classList.remove("sidebar-right-active");
    }
  }

  updateStatsUI();
  setStatus("Ready");
}

function formatTokenPricePerMillion(rawPricePerToken) {
  if (rawPricePerToken === undefined || rawPricePerToken === null) return "0.00";
  const num = parseFloat(rawPricePerToken || 0);
  if (isNaN(num) || num === 0) return "0.00";
  const perMillion = num * 1000000;
  if (perMillion >= 1) return perMillion.toFixed(2);
  if (perMillion >= 0.01) return perMillion.toFixed(2);
  return perMillion.toFixed(4);
}

export function estimateActiveChatPromptTokens() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return null;
  const character = isGm ? null : state.characters.find(c => c.id === activeId);
  const activeChatId = getActiveChatId(activeId);
  const chat = state.chats[activeChatId] || [];
  if (chat.length === 0 && !isGm && !character) return null;

  try {
    const messages = buildApiMessages(character, "", null, null, {}, activeChatId);
    if (!messages || !Array.isArray(messages)) return null;
    const totalChars = messages.reduce((acc, m) => {
      const c = m.content;
      return acc + (typeof c === "string" ? c.length : JSON.stringify(c || "").length);
    }, 0);
    return Math.max(1, Math.round(totalChars / 3.3));
  } catch (err) {
    return null;
  }
}

function updateStatsUI(lastPromptTokens = null, lastCompletionTokens = null, lastCost = null) {
  if (lastPromptTokens !== null && lastPromptTokens !== undefined) {
    state.lastPromptTokens = lastPromptTokens;
    saveLastPromptTokens(lastPromptTokens);
  }
  if (lastCompletionTokens !== null && lastCompletionTokens !== undefined) {
    state.lastCompletionTokens = lastCompletionTokens;
    saveLastCompletionTokens(lastCompletionTokens);
  }
  if (lastCost !== null && lastCost !== undefined) {
    state.lastCost = lastCost;
    saveLastCost(lastCost);
  }

  let promptCount = state.lastPromptTokens;
  let compCount = state.lastCompletionTokens;
  let costVal = state.lastCost;
  let isEstimated = false;

  if (promptCount === null || promptCount === undefined) {
    const est = estimateActiveChatPromptTokens();
    if (est) {
      promptCount = est;
      isEstimated = true;
    }
  }

  const modelId = state.apiSettings.selectedModel || "None";
  let details = state.modelsMetadata?.[modelId];
  if (!details && state.modelsMetadata) {
    const foundKey = Object.keys(state.modelsMetadata).find(k => k.toLowerCase() === modelId.toLowerCase());
    if (foundKey) {
      details = state.modelsMetadata[foundKey];
    }
  }

  // 1. Model Name
  if (dom.statsModelName) {
    dom.statsModelName.textContent = details?.name || modelId;
    dom.statsModelName.title = modelId;
  }

  // 2. Context Limit
  if (dom.statsContextLimit) {
    const limit = details?.context_length;
    dom.statsContextLimit.textContent = limit ? limit.toLocaleString() + " tokens" : "-";
  }

  // 3. Pricing
  if (dom.statsPricing) {
    // If endpoints are not yet cached for this model, trigger background fetch to get live discounts
    if (modelId && modelId !== "None" && !state.modelEndpointsCache?.[modelId] && (state.apiSettings.apiProvider || "openrouter") === "openrouter") {
      fetchModelEndpoints(modelId).then((eps) => {
        if (eps && eps.length > 0 && state.apiSettings.selectedModel === modelId) {
          updateStatsUI(lastPromptTokens, lastCompletionTokens, lastCost);
        }
      }).catch(() => {});
    }

    const pricingInfo = getEffectiveModelPricing(modelId);

    if (pricingInfo && pricingInfo.promptPrice !== null && pricingInfo.completionPrice !== null) {
      const promptNum = parseFloat(pricingInfo.promptPrice || 0);
      const compNum = parseFloat(pricingInfo.completionPrice || 0);
      if (promptNum === 0 && compNum === 0) {
        if ((state.apiSettings.apiProvider || "openrouter") === "nordrouter") {
          dom.statsPricing.textContent = "NordRouter";
          dom.statsPricing.style.color = "var(--text-primary)";
          dom.statsPricing.title = "Тарификация согласно балансу в личном кабинете NordRouter";
        } else if (state.apiSettings.apiProvider === "local" || state.apiSettings.apiProvider === "kobold") {
          dom.statsPricing.textContent = "Локально (Free)";
          dom.statsPricing.style.color = "var(--text-primary)";
          dom.statsPricing.title = "Локальная модель";
        } else {
          dom.statsPricing.textContent = "Free ($0.00)";
          dom.statsPricing.style.color = "var(--text-primary)";
          dom.statsPricing.title = "Эта модель полностью бесплатна на OpenRouter (0 токенов расхода)";
        }
      } else {
        const pPrice = formatTokenPricePerMillion(pricingInfo.promptPrice);
        const cPrice = formatTokenPricePerMillion(pricingInfo.completionPrice);
        const providerSuffix = pricingInfo.providerName ? ` (${pricingInfo.providerName})` : "";
        dom.statsPricing.textContent = `In: $${pPrice} | Out: $${cPrice}${providerSuffix}`;
        dom.statsPricing.style.color = "";
        const promo = pricingInfo.isDiscounted ? " [скидка]" : "";
        dom.statsPricing.title = `${pricingInfo.providerName || "Провайдер"}${promo}: Prompt $${pPrice}/1M ($${pricingInfo.promptPrice}/token) | Completion $${cPrice}/1M ($${pricingInfo.completionPrice}/token)`;
      }
    } else {
      dom.statsPricing.textContent = "-";
      dom.statsPricing.style.color = "";
      dom.statsPricing.title = "Нет данных о стоимости модели";
    }
  }

  // 4. Last Prompt Size
  if (dom.statsLastPromptTokens) {
    if (promptCount !== null && promptCount !== undefined) {
      dom.statsLastPromptTokens.textContent = `${promptCount.toLocaleString()} tokens${isEstimated ? " (~тек.)" : ""}`;
      dom.statsLastPromptTokens.title = isEstimated
        ? `Расчетный размер текущего контекста/промпта: ~${promptCount.toLocaleString()} токенов`
        : `Фактический размер последнего отправленного промпта: ${promptCount.toLocaleString()} токенов`;
    } else {
      dom.statsLastPromptTokens.textContent = "-";
    }
  }

  // 5. Last Completion Size
  if (dom.statsLastCompletionTokens) {
    dom.statsLastCompletionTokens.textContent = compCount !== null && compCount !== undefined ? compCount.toLocaleString() + " tokens" : "-";
  }

  // 6. Last Cost
  if (dom.statsLastCost) {
    dom.statsLastCost.textContent = costVal !== null && costVal !== undefined ? `$${costVal.toFixed(6)}` : "-";
  }

  // 7. Header Token Badge Pill
  if (dom.headerTokenBadge) {
    if (promptCount !== null && promptCount !== undefined) {
      dom.headerTokenBadge.style.display = "inline-flex";
      const costBadge = costVal ? ` • $${costVal.toFixed(4)}` : "";
      dom.headerTokenBadge.innerHTML = `<span>📥</span> <span>${promptCount.toLocaleString()} токенов${costBadge}</span>`;
      dom.headerTokenBadge.title = isEstimated
        ? `Текущий расчетный контекст: ~${promptCount.toLocaleString()} токенов. Нажмите, чтобы открыть подробную статистику.`
        : `Последний промпт: ${promptCount.toLocaleString()} токенов | Ответ: ${(compCount || 0).toLocaleString()} токенов | Стоимость хода: $${(costVal || 0).toFixed(6)}. Нажмите для подробной статистики.`;
    } else {
      dom.headerTokenBadge.style.display = "none";
    }
  }

  // 8. Total Spent
  if (dom.statsTotalSpent) {
    dom.statsTotalSpent.textContent = `$${state.totalSpent.toFixed(6)}`;
  }

  // 7b. OpenRouter Account Balance / Credits
  if (dom.statsOpenRouterCredits) {
    const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
    if ((state.apiSettings.apiProvider || "openrouter") === "openrouter" && apiConfig.apiKey) {
      fetchOpenRouterCredits(apiConfig.apiKey).then((res) => {
        if (!res) {
          dom.statsOpenRouterCredits.textContent = "-";
          return;
        }

        let remaining = null;
        if (res.totalCredits !== null && res.totalUsage !== null) {
          remaining = Math.max(0, res.totalCredits - res.totalUsage);
        } else if (res.totalCredits !== null) {
          remaining = res.totalCredits;
        }

        let keyRemaining = null;
        if (res.keyLimit !== null && res.keyUsage !== null) {
          keyRemaining = Math.max(0, res.keyLimit - res.keyUsage);
        }

        if (remaining !== null) {
          const displayBalance = remaining.toFixed(2);
          if (keyRemaining !== null && keyRemaining < remaining) {
            dom.statsOpenRouterCredits.textContent = `$${displayBalance} (Key limit: $${keyRemaining.toFixed(2)})`;
            dom.statsOpenRouterCredits.title = `Account Balance: $${displayBalance} | Key Used: $${res.keyUsage.toFixed(4)} / $${res.keyLimit}`;
          } else {
            dom.statsOpenRouterCredits.textContent = `$${displayBalance}`;
            dom.statsOpenRouterCredits.title = `Account Balance: $${displayBalance} (Purchased: $${res.totalCredits}, Used: $${res.totalUsage})`;
          }
        } else if (keyRemaining !== null) {
          dom.statsOpenRouterCredits.textContent = `$${keyRemaining.toFixed(2)} (Key Limit)`;
        } else if (res.isFreeTier) {
          dom.statsOpenRouterCredits.textContent = "Free Tier ($0.00)";
        } else {
          dom.statsOpenRouterCredits.textContent = "-";
        }
      });
    } else {
      dom.statsOpenRouterCredits.textContent = "-";
    }
  }

  // 8. History Summary Status
  if (dom.statsSummaryPresent) {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    const activeChatId = getActiveChatId(activeId);
    const summary = state.chatSummaries?.[activeChatId];
    if (summary && summary.trim()) {
      const wordCount = summary.trim().split(/\s+/).length;
      dom.statsSummaryPresent.textContent = `Yes (${wordCount} words)`;
      dom.statsSummaryPresent.title = summary;
      dom.statsSummaryPresent.style.cursor = "pointer";
      dom.statsSummaryPresent.style.textDecoration = "underline dashed rgba(255,255,255,0.4)";
    } else {
      dom.statsSummaryPresent.textContent = "No (Нажмите 'Память')";
      dom.statsSummaryPresent.title = "Нажмите чтобы открыть управление саммари";
      dom.statsSummaryPresent.style.cursor = "pointer";
      dom.statsSummaryPresent.style.textDecoration = "underline dashed rgba(255,255,255,0.4)";
    }
  }
}

const chatSummaryVersion = {};

function rollbackSummaryForChat(chatId, targetCount) {
  if (!chatId) return;
  chatSummaryVersion[chatId] = (chatSummaryVersion[chatId] || 0) + 1;
  const snapshots = state.chatSummarySnapshots[chatId] || [];
  
  // Find snapshots recorded when chat length was <= targetCount
  const validSnapshots = snapshots.filter(s => s && typeof s.msgCount === "number" && s.msgCount <= targetCount);
  if (validSnapshots.length > 0) {
    const bestSnap = validSnapshots[validSnapshots.length - 1];
    state.chatSummaries[chatId] = bestSnap.summary;
    state.chatSummarizedMessageCount[chatId] = bestSnap.msgCount;
    state.chatSummarySnapshots[chatId] = validSnapshots;
  } else {
    // If no snapshot exists prior to targetCount (e.g. early message regenerated), clear polluted summary
    delete state.chatSummaries[chatId];
    delete state.chatSummarizedMessageCount[chatId];
    state.chatSummarySnapshots[chatId] = [];
  }

  saveChatSummaries(state.chatSummaries);
  saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
  saveChatSummarySnapshots(state.chatSummarySnapshots);
}

async function summarizeChatHistoryBackground(character, chatId, force = false) {
  const summaryMode = state.apiSettings?.summaryMode || "every_turn";
  if (!force && summaryMode === "manual") {
    return false;
  }
  
  const chat = state.chats[chatId] || [];
  const totalMessages = chat.length;
  const currentSummarizedCount = state.chatSummarizedMessageCount[chatId] || 0;
  
  const currentVer = (chatSummaryVersion[chatId] = (chatSummaryVersion[chatId] || 0) + 1);

  const unsummarizedCount = totalMessages - currentSummarizedCount;
  if (!force && summaryMode === "every_5_messages" && unsummarizedCount < 5) {
    return false; // Triggers every 5 messages
  }
  
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (!apiConfig.apiKey && !apiConfig.baseUrl) {
    if (force) throw new Error("Не указан API-ключ или локальный URL в настройках!");
    return false;
  }
  
  const isFullRecap = force || !state.chatSummaries[chatId];
  let newMessages = [];
  if (isFullRecap) {
    newMessages = chat;
  } else if (summaryMode === "every_turn") {
    newMessages = chat.slice(-2);
  } else {
    newMessages = chat.slice(Math.max(0, currentSummarizedCount));
  }

  if (!newMessages || newMessages.length === 0) {
    if (force) throw new Error("История чата пуста — нечего саммаризировать.");
    return false;
  }
  
  if (dom.viewSummaryBtn) {
    dom.viewSummaryBtn.style.boxShadow = "0 0 12px rgba(255, 255, 255, 0.45)";
    dom.viewSummaryBtn.style.transition = "box-shadow 0.3s ease";
  }
  
  const isRuSummary = (state.apiSettings?.chatLanguage || "ru") === "ru";
  const existingSummary = state.chatSummaries[chatId] || "";
  const activePersona = getActivePersona();
  const userName = activePersona?.userName || "User";

  const newEventsText = newMessages.map(m => {
    let roleName = userName;
    if (m.role === "user") {
      roleName = userName;
    } else if (m.characterId) {
      const char = state.characters.find(c => c.id === m.characterId);
      if (char) {
        roleName = char.name;
      }
    }
    const cleanContent = stripThoughtTags(m.content || "").trim();
    return `${roleName}: ${cleanContent}`;
  }).join("\n");

  let systemPrompt = "";
  if (isRuSummary) {
    if (isFullRecap) {
      systemPrompt = `Ты — литературный архивариус и летописец ролевых историй.
Твоя задача — составить КОМПАКТНУЮ, ЕМКУЮ Хронику сюжета (Story Summary) на основе диалога.

История диалога:
"""
${newEventsText}
"""

СТРОГИЙ РЕГЛАМЕНТ АНТИ-РАЗДУВАНИЯ (SUMMARY COMPRESSION):
1. ЖЕСТКИЙ ЛИМИТ ОБЪЕМА: Весь текст саммари должен укладываться строго в 150–250 слов (не более 3-4 емких пунктов в каждом разделе).
2. ФИЛЬТРАЦИЯ БЫТОВОГО МУСОРА: Беспощадно игнорируй сиюминутные бытовые действия, рутину и переходные диалоги, которые уже потеряли значение (заказ еды, мелкие приветствия, передвижения из угла в угол, пустые разговоры).
3. ОБОБЩЕНИЕ В ВЕХИ: Схлопывай длинные цепочки прошлых действий в одну общую фразу (вместо "пошел на рынок, купил плащ, вышел за ворота" -> "Снарядился в дорогу и покинул город").
4. СОХРАНЯЙ ТОЛЬКО ЗНАЧИМОЕ: Фиксируй только факты с долгосрочными последствиями: ключевые решения, секреты, данные обещания, полученные травмы или важные предметы.

ФОРМАТ ВЫВОДА:
📖 СЮЖЕТНЫЕ ВЕХИ (Главное):
• [2-3 емких пункта ключевых поворотов сюжета]

👥 ОТНОШЕНИЯ И ДОГОВОРЕННОСТИ:
• [Текущая динамика между персонажами, взаимные обязательства, секреты]

📍 ТЕКУЩАЯ СИТУАЦИЯ:
• Локация и обстановка: [Где персонажи прямо сейчас]
• Активная цель / угроза: [Что они делают или чего опасаются в данный момент]

Выводи ИСКЛЮЧИТЕЛЬНО готовый компактный текст без вводных фраз и предисловий.`;
    } else {
      systemPrompt = `Ты — литературный архивариус и летописец ролевых историй.
Твоя задача — обновить Хронику сюжета, интегрировав события последнего хода, СОХРАНЯЯ САММАРИ КОМПАКТНЫМ И БЕЗ ВОДЫ.

Существующая Хроника:
"""
${existingSummary}
"""

Новые события (последний ход):
"""
${newEventsText}
"""

СТРОГИЙ РЕГЛАМЕНТ СЖАТИЯ И ОЧИСТКИ ОТ МУСОРА:
1. ЛИМИТ ОБЪЕМА — НЕ РАЗДУВАТЬ: Саммари НЕ ДОЛЖНО расти бесконечно! Общий объем — строго до 200–250 слов.
2. СХЛОПЫВАЙ ПРОШЛОЕ: Не просто приписывай новые пункты! Сжимай старые завершенные события в более краткие вехи предыстории, освобождая место новому.
3. ВЫБРАСЫВАЙ НЕАКТУАЛЬНОЕ: Удаляй мелкие бытовые детали, которые уже сыграли свою роль и больше не влияют на сюжет (заказы еды, мелкие проходные фразы, завершенные перемещения).
4. ФОКУС НА АКТУАЛЬНОМ:
   - Обнови "ТЕКУЩУЮ СИТУАЦИЮ" под самый последний ход.
   - Оставь в отношениях и обещаниях только то, что сохраняет силу прямо сейчас.

СТРУКТУРА:
📖 СЮЖЕТНЫЕ ВЕХИ:
• [3-4 емких обобщенных пункта]
👥 ОТНОШЕНИЯ И ДОГОВОРЕННОСТИ:
• ...
📍 ТЕКУЩАЯ СИТУАЦИЯ:
• Локация и обстановка: ...
• Активная цель / угроза: ...

Выводи ИСКЛЮЧИТЕЛЬНО обновленный компактный текст без вводных фраз.`;
    }
  } else {
    if (isFullRecap) {
      systemPrompt = `You are an expert story archivist and chronicler for roleplay sessions.
Your task is to compile a CONCISE, DENSE Story Summary based on the dialogue history.

Dialogue History:
"""
${newEventsText}
"""

ANTI-BLOAT & COMPRESSION RULES:
1. STRICT LENGTH BUDGET: Keep the entire summary strictly within 150–250 words (no more than 3-4 dense bullets per section).
2. PRUNE TRANSIENT FLUFF: Ruthlessly ignore minor domestic routines, transitory logistical actions, and small talk that no longer impact the future (ordering food, shifting positions, casual greetings).
3. CONSOLIDATE INTO MILESTONES: Roll up multi-step sequences of past actions into single summary milestones (e.g. instead of "went to market, bought cloak, left city" -> "Geared up and departed the city").
4. PRESERVE ONLY CONSEQUENTIAL FACTS: Record only events with lasting consequences: major decisions, secrets, sworn promises, injuries, or key acquired items.

OUTPUT FORMAT:
📖 STORY MILESTONES:
• [2-3 concise bullets of major plot turns]

👥 RELATIONSHIPS & AGREEMENTS:
• [Current interpersonal dynamics, sworn promises, secrets]

📍 CURRENT SITUATION:
• Location & Environment: [Where characters are right now]
• Active Objective / Threat: [What they are actively doing or facing]

Output ONLY the finalized concise text without commentary.`;
    } else {
      systemPrompt = `You are an expert story archivist and chronicler for roleplay sessions.
Your task is to update the Story Summary with facts from the latest turn, KEEPING IT CONCISE AND FREE OF BLOAT.

Existing Chronicle:
"""
${existingSummary}
"""

New Events (Latest Turn):
"""
${newEventsText}
"""

STRICT COMPRESSION & CLEANUP RULES:
1. LENGTH BUDGET — DO NOT BLOAT: The summary must NOT grow indefinitely! Strict limit: 200–250 words total.
2. CONSOLIDATE THE PAST: Do not merely append new bullet points! Roll up older completed events into shorter milestone summaries to make room for recent developments.
3. PRUNE OBSOLETE DETAILS: Discard minor transitory details that have already played out and no longer affect current stakes (transitory meals, resolved banter, minor errands).
4. FOCUS ON CURRENT RELEVANCE:
   - Update "CURRENT SITUATION" to match the latest turn.
   - Keep only active promises, lingering secrets, and ongoing relational dynamics.

STRUCTURE:
📖 STORY MILESTONES:
• [3-4 dense consolidated bullets]
👥 RELATIONSHIPS & AGREEMENTS:
• ...
📍 CURRENT SITUATION:
• Location & Environment: ...
• Active Objective / Threat: ...

Output ONLY the updated concise text without filler.`;
    }
  }

  console.log(`[Summary] Generating background summary for chat ${chatId} (force: ${force}, full: ${isFullRecap}, mode: ${summaryMode}, ver: ${currentVer})...`);
  
  const primaryModel = state.apiSettings.evaluatorModel || apiConfig.model;
  let response = null;

  try {
    try {
      response = await sendMessageNonStream({
        apiKey: apiConfig.apiKey,
        baseUrl: apiConfig.baseUrl,
        model: primaryModel,
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.3,
        maxTokens: 600
      });
    } catch (primaryErr) {
      if (primaryModel !== apiConfig.model && apiConfig.model) {
        console.warn(`[Summary] Primary model "${primaryModel}" failed, falling back to chat model "${apiConfig.model}":`, primaryErr);
        response = await sendMessageNonStream({
          apiKey: apiConfig.apiKey,
          baseUrl: apiConfig.baseUrl,
          model: apiConfig.model,
          messages: [{ role: "user", content: systemPrompt }],
          temperature: 0.3,
          maxTokens: 600
        });
      } else {
        throw primaryErr;
      }
    }
    
    // Guard against race conditions
    if (chatSummaryVersion[chatId] !== currentVer) {
      console.log(`[Summary] Discarded stale background summary for chat ${chatId} (requestVer: ${currentVer}, currentVer: ${chatSummaryVersion[chatId]})`);
      if (dom.viewSummaryBtn) dom.viewSummaryBtn.style.boxShadow = "none";
      return false;
    }

    const cleanSummary = stripThoughtTags(response || "").trim();
    if (cleanSummary) {
      state.chatSummaries[chatId] = cleanSummary;
      state.chatSummarizedMessageCount[chatId] = totalMessages;
      
      state.chatSummarySnapshots[chatId] = state.chatSummarySnapshots[chatId] || [];
      state.chatSummarySnapshots[chatId].push({
        msgCount: totalMessages,
        summary: cleanSummary
      });
      if (state.chatSummarySnapshots[chatId].length > 50) {
        state.chatSummarySnapshots[chatId] = state.chatSummarySnapshots[chatId].slice(-50);
      }

      saveChatSummaries(state.chatSummaries);
      saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
      saveChatSummarySnapshots(state.chatSummarySnapshots);
      console.log(`[Summary] New summary saved for chat ${chatId} (msgCount: ${totalMessages}):`, cleanSummary);
      
      updateStatsUI();
      
      const wordCount = cleanSummary.split(/\s+/).length;
      if (force) {
        showStateNotification(`✨ Саммари успешно обновлено (${wordCount} слов)`);
      }
      
      // Update modal textarea live if currently open
      if (dom.summaryTextInput && (dom.summaryDialog?.open || dom.summaryDialog?.hasAttribute("open"))) {
        dom.summaryTextInput.value = cleanSummary;
      }
      if (dom.summaryStatusBadge) {
        dom.summaryStatusBadge.textContent = `Активно (${wordCount} слов)`;
        dom.summaryStatusBadge.style.color = "var(--text-primary)";
      }

      if (dom.viewSummaryBtn) {
        dom.viewSummaryBtn.style.boxShadow = "0 0 14px rgba(255, 255, 255, 0.4)";
        setTimeout(() => {
          if (dom.viewSummaryBtn) dom.viewSummaryBtn.style.boxShadow = "none";
        }, 3000);
      }
      
      return cleanSummary;
    }
  } catch (error) {
    if (dom.viewSummaryBtn) dom.viewSummaryBtn.style.boxShadow = "none";
    console.error("[Summary] Summarization failed:", error);
    if (force) throw error;
  }
  return false;
}

function openSummaryModal() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  const activeChatId = getActiveChatId(activeId);
  const summary = state.chatSummaries?.[activeChatId] || "";
  
  if (dom.summaryTextInput) {
    dom.summaryTextInput.value = summary;
  }
  if (dom.summaryStatusBadge) {
    if (summary.trim()) {
      const words = summary.trim().split(/\s+/).length;
      dom.summaryStatusBadge.textContent = `Активно (${words} слов)`;
      dom.summaryStatusBadge.style.color = "var(--text-primary)";
    } else {
      dom.summaryStatusBadge.textContent = "Отсутствует";
      dom.summaryStatusBadge.style.color = "var(--text-muted)";
    }
  }
  if (dom.summaryFeedbackMsg) {
    dom.summaryFeedbackMsg.textContent = "";
  }

  // Render Live Story Codex
  renderSessionCodex(activeChatId);
  switchCodexTab(typeof initialTab === "string" ? initialTab : "structured");

  if (dom.summaryDialog && typeof dom.summaryDialog.showModal === "function") {
    dom.summaryDialog.showModal();
  }
}

if (dom.openSessionCodexBtn) {
  dom.openSessionCodexBtn.addEventListener("click", () => openSummaryModal("structured"));
}
if (dom.sidebarCodexPreview) {
  dom.sidebarCodexPreview.addEventListener("click", () => openSummaryModal("structured"));
  dom.sidebarCodexPreview.style.cursor = "pointer";
}

if (dom.tabCodexStructuredBtn) {
  dom.tabCodexStructuredBtn.addEventListener("click", () => switchCodexTab("structured"));
}
if (dom.tabCodexSummaryBtn) {
  dom.tabCodexSummaryBtn.addEventListener("click", () => switchCodexTab("summary"));
}
if (dom.tabCodexJsonBtn) {
  dom.tabCodexJsonBtn.addEventListener("click", () => switchCodexTab("json"));
}

if (dom.btnAddCodexCharBtn) {
  dom.btnAddCodexCharBtn.addEventListener("click", () => {
    if (dom.codexCharactersList) {
      const newCard = createCodexCharacterCard("", {});
      dom.codexCharactersList.appendChild(newCard);
      newCard.querySelector(".codex-char-name")?.focus();
    }
  });
}

if (dom.addCodexThreadBtn && dom.newCodexThreadInput) {
  const handleAddThread = () => {
    const val = dom.newCodexThreadInput.value.trim();
    if (!val) return;
    if (dom.codexThreadsList) {
      dom.codexThreadsList.appendChild(createCodexThreadItem(val));
      dom.newCodexThreadInput.value = "";
    }
  };
  dom.addCodexThreadBtn.addEventListener("click", handleAddThread);
  dom.newCodexThreadInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddThread();
    }
  });
}

if (dom.btnAddCodexEventBtn) {
  dom.btnAddCodexEventBtn.addEventListener("click", () => {
    if (dom.codexEventsList) {
      const newCard = createCodexEventItem({});
      dom.codexEventsList.appendChild(newCard);
      newCard.querySelector(".codex-event-summary")?.focus();
    }
  });
}

if (dom.btnSaveCodex) {
  dom.btnSaveCodex.addEventListener("click", () => {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    const activeChatId = getActiveChatId(activeId);
    const updatedMem = collectSessionCodexFromUI();
    saveSessionMemory(activeChatId, updatedMem);
    state.sessionMemories[activeChatId] = updatedMem;
    renderSessionCodex(activeChatId);
    setStatus("Живой Кодекс Сессии сохранен!");
    if (dom.summaryFeedbackMsg) {
      dom.summaryFeedbackMsg.textContent = "✅ Живой Кодекс Сессии успешно сохранен!";
      dom.summaryFeedbackMsg.style.color = "var(--text-secondary)";
    }
  });
}

if (dom.btnApplyCodexJson) {
  dom.btnApplyCodexJson.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(dom.codexJsonInput.value);
      const isGm = state.sidebarTab === "gm";
      const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
      const activeChatId = getActiveChatId(activeId);
      saveSessionMemory(activeChatId, parsed);
      state.sessionMemories[activeChatId] = parsed;
      renderSessionCodex(activeChatId);
      switchCodexTab("structured");
      setStatus("Кодекс обновлен из JSON!");
      if (dom.summaryFeedbackMsg) {
        dom.summaryFeedbackMsg.textContent = "✅ Кодекс успешно обновлен из JSON!";
        dom.summaryFeedbackMsg.style.color = "var(--text-secondary)";
      }
    } catch (err) {
      alert("Ошибка JSON: " + err.message);
    }
  });
}

if (dom.btnAiUpdateCodex) {
  dom.btnAiUpdateCodex.addEventListener("click", async () => {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    const activeChatId = getActiveChatId(activeId);
    const chat = state.chats[activeChatId] || [];
    if (!chat || chat.length === 0) {
      alert("История чата пуста — пока нечего анализировать!");
      return;
    }
    dom.btnAiUpdateCodex.disabled = true;
    const origText = dom.btnAiUpdateCodex.innerHTML;
    dom.btnAiUpdateCodex.textContent = "⏳ Анализ...";
    setStatus("ИИ анализирует ход сессии и обновляет Кодекс...");
    if (dom.summaryFeedbackMsg) {
      dom.summaryFeedbackMsg.textContent = "⏳ ИИ анализирует сюжет, сеттинг и отношения...";
      dom.summaryFeedbackMsg.style.color = "var(--text-muted)";
    }
    try {
      const existingMem = getSessionMemory(activeChatId) || createDefaultSessionMemory();
      const updatedMem = await extractStructuredMemoryFromLLM(existingMem, chat);
      saveSessionMemory(activeChatId, updatedMem);
      state.sessionMemories[activeChatId] = updatedMem;
      renderSessionCodex(activeChatId);
      setStatus("Живой Кодекс Сессии успешно обновлен ИИ!");
      if (dom.summaryFeedbackMsg) {
        dom.summaryFeedbackMsg.textContent = "✨ Живой Кодекс Сессии успешно актуализирован ИИ!";
        dom.summaryFeedbackMsg.style.color = "var(--text-primary)";
      }
    } catch (err) {
      console.error("[SessionMemory] Update failed:", err);
      if (dom.summaryFeedbackMsg) {
        dom.summaryFeedbackMsg.textContent = `❌ Ошибка: ${err.message}`;
        dom.summaryFeedbackMsg.style.color = "#ef4444";
      }
      alert(`Не удалось обновить Кодекс через ИИ: ${err.message}`);
    } finally {
      dom.btnAiUpdateCodex.disabled = false;
      dom.btnAiUpdateCodex.innerHTML = origText;
    }
  });
}

if (dom.viewSummaryBtn) {
  dom.viewSummaryBtn.addEventListener("click", () => openSummaryModal("structured"));
}
if (dom.statsSummaryPresent) {
  dom.statsSummaryPresent.addEventListener("click", () => openSummaryModal("summary"));
}

if (dom.saveSummaryBtn) {
  dom.saveSummaryBtn.addEventListener("click", () => {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    const activeChatId = getActiveChatId(activeId);
    const chat = state.chats[activeChatId] || [];
    const newSummaryText = dom.summaryTextInput?.value.trim() || "";
    
    if (newSummaryText) {
      state.chatSummaries[activeChatId] = newSummaryText;
      state.chatSummarizedMessageCount[activeChatId] = chat.length;
    } else {
      delete state.chatSummaries[activeChatId];
      delete state.chatSummarizedMessageCount[activeChatId];
    }
    
    saveChatSummaries(state.chatSummaries);
    saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
    updateStatsUI();
    
    if (dom.summaryFeedbackMsg) {
      dom.summaryFeedbackMsg.textContent = "✅ Саммари успешно сохранено!";
      dom.summaryFeedbackMsg.style.color = "var(--text-secondary)";
    }
  });
}

if (dom.forceGenerateSummaryBtn) {
  dom.forceGenerateSummaryBtn.addEventListener("click", async () => {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    const activeChatId = getActiveChatId(activeId);
    const character = state.characters.find(c => c.id === activeId);
    
    if (dom.summaryFeedbackMsg) {
      dom.summaryFeedbackMsg.textContent = "⏳ Генерируем новое саммари через API...";
      dom.summaryFeedbackMsg.style.color = "var(--text-muted)";
    }
    dom.forceGenerateSummaryBtn.disabled = true;
    
    try {
      const newSummary = await summarizeChatHistoryBackground(character, activeChatId, true);
      if (newSummary) {
        if (dom.summaryTextInput) dom.summaryTextInput.value = newSummary;
        if (dom.summaryStatusBadge) {
          const words = newSummary.trim().split(/\s+/).length;
          dom.summaryStatusBadge.textContent = `Активно (${words} слов)`;
          dom.summaryStatusBadge.style.color = "var(--text-primary)";
        }
        if (dom.summaryFeedbackMsg) {
          dom.summaryFeedbackMsg.textContent = "🎉 Новое подробное саммари успешно сгенерировано!";
          dom.summaryFeedbackMsg.style.color = "var(--text-secondary)";
        }
      } else {
        if (dom.summaryFeedbackMsg) {
          dom.summaryFeedbackMsg.textContent = "⚠️ Сообщения отсутствуют или вызов вернул пустой ответ.";
          dom.summaryFeedbackMsg.style.color = "var(--text-muted)";
        }
      }
    } catch (err) {
      if (dom.summaryFeedbackMsg) {
        dom.summaryFeedbackMsg.textContent = `❌ Ошибка генерации: ${err.message || err}`;
        dom.summaryFeedbackMsg.style.color = "#ef4444";
      }
    } finally {
      dom.forceGenerateSummaryBtn.disabled = false;
    }
  });
}

if (dom.resetCharacterPersonalityBtn) {
  dom.resetCharacterPersonalityBtn.addEventListener("click", () => {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    const activeChatId = getActiveChatId(activeId);
    
    if (!activeChatId) return;

    const currentStates = getChatStates(activeChatId);
    const resetStates = {
      ...currentStates,
      mood: "neutral",
      relationshipStage: "Stranger",
      statusConditions: {},
      affinity: 50,
      trust: 50
    };

    for (const [k, v] of Object.entries(resetStates)) {
      if (typeof v === "number" && !k.startsWith("duo_")) {
        resetStates[k] = 50;
      }
    }

    state.chatStates[activeChatId] = resetStates;
    saveChatStates(state.chatStates);

    renderMood();
    renderRelationshipStage();
    renderStates();
    renderProgressBar();
    showStateNotification("✨ Исходный характер и эмоции персонажа восстановлены! Вся сюжетная память сохранена.");

    if (dom.summaryFeedbackMsg) {
      dom.summaryFeedbackMsg.textContent = "✨ Характер и манера речи персонажа сброшены к исходным! Память сохранена.";
      dom.summaryFeedbackMsg.style.color = "var(--text-secondary)";
    }
  });
}

function renderWorldLoreCategoryCards(containerEl, items = []) {
  if (!containerEl) return;
  containerEl.innerHTML = "";
  if (!Array.isArray(items) || items.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.style.fontSize = "11px";
    emptyMsg.style.color = "var(--text-muted)";
    emptyMsg.style.fontStyle = "italic";
    emptyMsg.style.margin = "4px 0";
    emptyMsg.textContent = "Записи отсутствуют. Нажмите кнопку '+' выше, чтобы добавить.";
    containerEl.appendChild(emptyMsg);
    return;
  }

  items.forEach(item => {
    const card = createWorldLoreCard(item.name || "", item.description || "");
    containerEl.appendChild(card);
  });
}

function openWorldLoreModal() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  const chatMeta = state.chatMetadata?.[activeChatId] || {};
  const worldLore = chatMeta.worldLore || {};

  renderWorldLoreCategoryCards(dom.worldLoreLocationsList, worldLore.locations || []);
  renderWorldLoreCategoryCards(dom.worldLoreRulesList, worldLore.rules || []);
  renderWorldLoreCategoryCards(dom.worldLoreFactionsList, worldLore.factions || []);
  renderWorldLoreCategoryCards(dom.worldLoreItemsList, worldLore.items || []);

  if (dom.worldLoreFeedbackMsg) dom.worldLoreFeedbackMsg.textContent = "";

  if (dom.worldLoreDialog && typeof dom.worldLoreDialog.showModal === "function") {
    dom.worldLoreDialog.showModal();
  }
}

function readCategoryCards(containerEl) {
  if (!containerEl) return [];
  const cards = containerEl.querySelectorAll(".world-lore-card");
  const result = [];
  cards.forEach(card => {
    const name = card.querySelector(".world-lore-card-name")?.value.trim() || "";
    const description = card.querySelector(".world-lore-card-desc")?.value.trim() || "";
    if (name || description) {
      result.push({ name, description });
    }
  });
  return result;
}

async function handleGenerateWorldLore() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) {
    showStateNotification("⚠️ Выберите персонажа или GM-сцену.");
    return;
  }

  const activeChatId = getActiveChatId(activeId);

  showStateNotification("🌍 Генератор Мира: Анализ истории и создание карточек...");
  if (dom.generateWorldLoreBtn) dom.generateWorldLoreBtn.innerHTML = "<span>⏳ Анализ...</span>";
  if (dom.rebuildWorldLoreBtn) dom.rebuildWorldLoreBtn.textContent = "⏳ Генерация...";

  try {
    const lore = await generateWorldLoreFromChat(activeChatId);
    if (!lore) throw new Error("Не удалось сгенерировать мир");

    state.chatMetadata[activeChatId] = {
      ...(state.chatMetadata[activeChatId] || {}),
      worldLore: lore
    };
    saveChatMetadata(state.chatMetadata);

    // Rebuild RAG index with new World Lore
    buildRagIndex(activeChatId);

    openWorldLoreModal();
    showStateNotification("✨ Карточки Мира созданы и проиндексированы в RAG!");
  } catch (err) {
    showStateNotification(`⚠️ Ошибка генерации мира: ${err.message}`);
  } finally {
    if (dom.generateWorldLoreBtn) dom.generateWorldLoreBtn.innerHTML = "<span>🌍 Сгенерировать мир</span>";
    if (dom.rebuildWorldLoreBtn) dom.rebuildWorldLoreBtn.textContent = "✨ Сгенерировать карточки мира из диалога";
  }
}

if (dom.addLocationLoreBtn) {
  dom.addLocationLoreBtn.addEventListener("click", () => {
    const card = createWorldLoreCard("", "");
    const emptyMsg = dom.worldLoreLocationsList.querySelector("p");
    if (emptyMsg) emptyMsg.remove();
    dom.worldLoreLocationsList.appendChild(card);
  });
}

if (dom.addRuleLoreBtn) {
  dom.addRuleLoreBtn.addEventListener("click", () => {
    const card = createWorldLoreCard("", "");
    const emptyMsg = dom.worldLoreRulesList.querySelector("p");
    if (emptyMsg) emptyMsg.remove();
    dom.worldLoreRulesList.appendChild(card);
  });
}

if (dom.addFactionLoreBtn) {
  dom.addFactionLoreBtn.addEventListener("click", () => {
    const card = createWorldLoreCard("", "");
    const emptyMsg = dom.worldLoreFactionsList.querySelector("p");
    if (emptyMsg) emptyMsg.remove();
    dom.worldLoreFactionsList.appendChild(card);
  });
}

if (dom.addItemLoreBtn) {
  dom.addItemLoreBtn.addEventListener("click", () => {
    const card = createWorldLoreCard("", "");
    const emptyMsg = dom.worldLoreItemsList.querySelector("p");
    if (emptyMsg) emptyMsg.remove();
    dom.worldLoreItemsList.appendChild(card);
  });
}

if (dom.openWorldLoreBtn) {
  dom.openWorldLoreBtn.addEventListener("click", openWorldLoreModal);
}
if (dom.generateWorldLoreBtn) {
  dom.generateWorldLoreBtn.addEventListener("click", handleGenerateWorldLore);
}
if (dom.rebuildWorldLoreBtn) {
  dom.rebuildWorldLoreBtn.addEventListener("click", handleGenerateWorldLore);
}

if (dom.saveWorldLoreBtn) {
  dom.saveWorldLoreBtn.addEventListener("click", () => {
    const isGm = state.sidebarTab === "gm";
    const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
    if (!activeId) return;

    const activeChatId = getActiveChatId(activeId);
    const lore = {
      locations: readCategoryCards(dom.worldLoreLocationsList),
      rules: readCategoryCards(dom.worldLoreRulesList),
      factions: readCategoryCards(dom.worldLoreFactionsList),
      items: readCategoryCards(dom.worldLoreItemsList)
    };

    state.chatMetadata[activeChatId] = {
      ...(state.chatMetadata[activeChatId] || {}),
      worldLore: lore
    };
    saveChatMetadata(state.chatMetadata);

    // Rebuild RAG Index
    buildRagIndex(activeChatId);

    if (dom.worldLoreFeedbackMsg) {
      dom.worldLoreFeedbackMsg.textContent = "✨ Карточки мира успешно сохранены и проиндексированы в RAG!";
    }
    showStateNotification("✨ Энциклопедия Мира сохранена и проиндексирована в RAG!");
  });
}

// ── TIME SKIP MODAL & ACTIONS ──

function openTimeSkipModal() {
  if (dom.timeSkipDurationInput) dom.timeSkipDurationInput.value = "";
  if (dom.timeSkipDetailsInput) dom.timeSkipDetailsInput.value = "";
  document.querySelectorAll(".time-skip-preset-chip").forEach(c => c.classList.remove("active"));
  if (dom.timeSkipDialog && typeof dom.timeSkipDialog.showModal === "function") {
    dom.timeSkipDialog.showModal();
  }
}

if (dom.timeSkipBtn) {
  dom.timeSkipBtn.addEventListener("click", openTimeSkipModal);
}
function openChatScenarioModal() {
  if (state.sidebarTab === "gm") {
    showStateNotification("В GM-сцене сценарий задаётся в самой сцене.");
    return;
  }
  const activeId = state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  const chatEntry = (state.chatMetadata[activeId] || []).find(c => c.id === activeChatId);
  if (isDuoChat(chatEntry)) {
    showStateNotification("В дуэт-чате сценарий берётся у основного персонажа.");
    return;
  }

  const character = getActiveCharacter();
  const defaultScenario = (character?.scenario || "").trim();
  dom.chatScenarioInput.value = state.chatMetadata?.[activeChatId]?.customScenario || "";
  dom.chatScenarioInput.placeholder = defaultScenario
    ? `По умолчанию: ${defaultScenario.slice(0, 140)}${defaultScenario.length > 140 ? "…" : ""}`
    : "Опишите место, время, ситуацию и цели сцены.";
  dom.chatScenarioDialog.showModal();
}

function saveChatScenario(text) {
  const activeId = state.activeCharacterId;
  if (!activeId) return;
  const activeChatId = getActiveChatId(activeId);
  const trimmed = (text || "").trim();

  const next = { ...(state.chatMetadata[activeChatId] || {}) };
  if (trimmed) {
    next.customScenario = trimmed;
  } else {
    delete next.customScenario;
  }
  state.chatMetadata[activeChatId] = next;
  saveChatMetadata(state.chatMetadata);
  dom.chatScenarioDialog.close();
  showStateNotification(trimmed ? "📜 Сценарий чата сохранён" : "Сценарий чата сброшен к сценарию персонажа");
}

if (dom.chatScenarioBtn) {
  dom.chatScenarioBtn.addEventListener("click", openChatScenarioModal);
}
document.querySelectorAll(".chat-scenario-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (dom.chatScenarioInput) {
      dom.chatScenarioInput.value = btn.dataset.scenario || "";
      dom.chatScenarioInput.focus();
    }
  });
});
if (dom.chatScenarioSaveBtn) {
  dom.chatScenarioSaveBtn.addEventListener("click", () => saveChatScenario(dom.chatScenarioInput.value));
}
if (dom.chatScenarioResetBtn) {
  dom.chatScenarioResetBtn.addEventListener("click", () => saveChatScenario(""));
}
if (dom.chatScenarioCancelBtn) {
  dom.chatScenarioCancelBtn.addEventListener("click", () => dom.chatScenarioDialog?.close());
}

if (dom.timeSkipDropdownBtn) {
  dom.timeSkipDropdownBtn.addEventListener("click", () => {
    if (dom.chatActionsDropdown) dom.chatActionsDropdown.classList.remove("open");
    openTimeSkipModal();
  });
}
if (dom.timeSkipCancelBtn) {
  dom.timeSkipCancelBtn.addEventListener("click", () => {
    dom.timeSkipDialog?.close();
  });
}

// Preset chips handler
document.querySelectorAll(".time-skip-preset-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".time-skip-preset-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    if (dom.timeSkipDurationInput) {
      dom.timeSkipDurationInput.value = chip.dataset.time || "";
    }
    if (dom.timeSkipDetailsInput && !dom.timeSkipDetailsInput.value.trim()) {
      dom.timeSkipDetailsInput.value = chip.dataset.detail || "";
    }
  });
});

// Insert into composer input button
if (dom.timeSkipInsertInputBtn) {
  dom.timeSkipInsertInputBtn.addEventListener("click", () => {
    const duration = dom.timeSkipDurationInput?.value.trim() || "некоторое время";
    const details = dom.timeSkipDetailsInput?.value.trim() || "";
    const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";
    const textToInsert = isRu
      ? `*[Прошло ${duration}.${details ? ` ${details}` : ""}]* `
      : `*[Elapsed ${duration}.${details ? ` ${details}` : ""}]* `;
    if (dom.messageInput) {
      dom.messageInput.value = textToInsert + dom.messageInput.value;
      autoResizeComposer();
      dom.messageInput.focus();
    }
    dom.timeSkipDialog?.close();
  });
}

// Execute time skip button
if (dom.timeSkipSubmitBtn) {
  dom.timeSkipSubmitBtn.addEventListener("click", () => {
    const duration = dom.timeSkipDurationInput?.value.trim();
    if (!duration) {
      alert("Укажите, сколько времени прошло (или выберите быстрый пресет)!");
      return;
    }
    const details = dom.timeSkipDetailsInput?.value.trim() || "";
    const autoGen = dom.timeSkipAutoGenerateToggle?.checked !== false;

    const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";
    const promptText = isRu
      ? `*[⏳ ВРЕМЕННОЙ СКАЧОК: Прошло ${duration}.${details ? ` Обстановка / что произошло: ${details}.` : ""} Опиши начало новой сцены, где сейчас находятся персонажи, атмосферу и начни диалог.]*`
      : `*[⏳ TIME SKIP: Elapsed ${duration}.${details ? ` Changes / context: ${details}.` : ""} Describe the start of the new scene, where characters are, atmosphere, and resume dialogue.]*`;

    state.pendingTimeSkipData = {
      timeText: duration,
      detailText: details
    };

    dom.timeSkipDialog?.close();

    if (autoGen) {
      if (dom.messageInput) dom.messageInput.value = promptText;
      handleSendMessage();
    } else {
      if (dom.messageInput) {
        dom.messageInput.value = promptText + "\n";
        autoResizeComposer();
        dom.messageInput.focus();
      }
    }
  });
}

if (dom.headerTokenBadge) {
  dom.headerTokenBadge.addEventListener("click", () => {
    switchRightSidebarTab("stats");
    if (dom.sidebarRight && !dom.sidebarRight.classList.contains("active")) {
      dom.sidebarRight.classList.add("active");
      if (dom.app) dom.app.classList.add("sidebar-right-active");
    }
  });
}

// ── CHAT FONT SIZE CONTROLS ──
let currentChatFontSize = loadChatFontSize();

function applyChatFontSize(size) {
  currentChatFontSize = Math.min(24, Math.max(12, Math.round(size * 10) / 10));
  document.documentElement.style.setProperty("--chat-font-size", `${currentChatFontSize}px`);
  if (dom.fontSizeDisplay) {
    dom.fontSizeDisplay.textContent = `${currentChatFontSize}`;
  }
  const settingsDisplay = document.getElementById("settingsFontSizeDisplay");
  if (settingsDisplay) {
    settingsDisplay.textContent = `${currentChatFontSize}`;
  }
}

if (dom.fontSizeIncBtn) {
  dom.fontSizeIncBtn.addEventListener("click", () => {
    applyChatFontSize(currentChatFontSize + 1);
    saveChatFontSize(currentChatFontSize);
  });
}

if (dom.fontSizeDecBtn) {
  dom.fontSizeDecBtn.addEventListener("click", () => {
    applyChatFontSize(currentChatFontSize - 1);
    saveChatFontSize(currentChatFontSize);
  });
}

const sInc = document.getElementById("settingsFontSizeIncBtn");
if (sInc) {
  sInc.addEventListener("click", () => {
    applyChatFontSize(currentChatFontSize + 1);
    saveChatFontSize(currentChatFontSize);
  });
}
const sDec = document.getElementById("settingsFontSizeDecBtn");
if (sDec) {
  sDec.addEventListener("click", () => {
    applyChatFontSize(currentChatFontSize - 1);
    saveChatFontSize(currentChatFontSize);
  });
}

applyChatFontSize(currentChatFontSize);

// ── DIALOGUE COLOR THEME CONTROLS ──
const DIALOGUE_THEMES = {
  white: {
    color: "#ffffff",
    border: "rgba(255, 255, 255, 0.55)",
    bg: "rgba(255, 255, 255, 0.08)"
  },
  silver: {
    color: "#f4f4f5",
    border: "rgba(255, 255, 255, 0.35)",
    bg: "rgba(255, 255, 255, 0.06)"
  },
  zinc: {
    color: "#e4e4e7",
    border: "#71717a",
    bg: "rgba(255, 255, 255, 0.04)"
  },
  ghost: {
    color: "#d4d4d8",
    border: "rgba(255, 255, 255, 0.2)",
    bg: "rgba(255, 255, 255, 0.03)"
  },
  gold: {
    color: "#ffffff",
    border: "rgba(255, 255, 255, 0.55)",
    bg: "rgba(255, 255, 255, 0.08)"
  },
  cyan: {
    color: "#f4f4f5",
    border: "rgba(255, 255, 255, 0.35)",
    bg: "rgba(255, 255, 255, 0.06)"
  },
  emerald: {
    color: "#e4e4e7",
    border: "#71717a",
    bg: "rgba(255, 255, 255, 0.04)"
  }
};

let currentDialogueTheme = loadDialogueColorTheme();

function applyDialogueColorTheme(themeName) {
  currentDialogueTheme = DIALOGUE_THEMES[themeName] ? themeName : "white";
  const theme = DIALOGUE_THEMES[currentDialogueTheme];
  document.documentElement.style.setProperty("--dialogue-color", theme.color);
  document.documentElement.style.setProperty("--dialogue-border", theme.border);
  document.documentElement.style.setProperty("--dialogue-bg", theme.bg);

  document.querySelectorAll(".dialogue-color-dot").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.theme === currentDialogueTheme);
  });
}

document.querySelectorAll(".dialogue-color-dot").forEach((dot) => {
  dot.addEventListener("click", () => {
    const themeName = dot.dataset.theme;
    applyDialogueColorTheme(themeName);
    saveDialogueColorTheme(themeName);
  });
});

applyDialogueColorTheme(currentDialogueTheme);

bootstrap();
console.log("App script loaded completely");
