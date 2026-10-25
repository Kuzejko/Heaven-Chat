import { state } from "./state.js";
import { dom, renderPersonaList, renderGmScenes, showStateNotification } from "./ui.js";
import { defaultCharacters } from "../data/defaultCharacters.js";
import { fetchModelEndpoints } from "../services/openrouter.js";
import {
  saveCharacters,
  saveChats,
  saveGlobalSystemPrompt,
  saveChatStates,
  saveChatMetadata,
  saveModelsCache,
  saveApiSettings,
  saveApiKey,
  loadApiKey,
  saveNordrouterApiKey,
  loadNordrouterApiKey,
  getActivePersona,
  loadPersonas,
  savePersonas,
  saveGmScenes,
  saveGmChats,
  saveActiveGmSceneId,
  saveCustomStateStages,
  saveCustomStateTypes,
  saveModelsMetadataCache,
  saveTotalSpent,
  saveChatSummaries,
  saveChatSummarizedMessageCount,
  saveChatSummarySnapshots,
  savePinnedFacts,
  saveSidebarTab,
  saveSessionMemories,
  clearAllStorageData,
  loadCharacters
} from "../services/storage.js";

function getActiveCharacter() {
  return state.characters.find((c) => c.id === state.activeCharacterId) || null;
}

export function exportAllDataJSON() {
  const payload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    characters: state.characters || [],
    chats: state.chats || {},
    globalSystemPrompt: state.globalSystemPrompt || "",
    chatStates: state.chatStates || {},
    chatMetadata: state.chatMetadata || {},
    models: state.models || [],
    modelsMetadata: state.modelsMetadata || {},
    gmScenes: state.gmScenes || [],
    gmChats: state.gmChats || {},
    activeGmSceneId: state.activeGmSceneId || "",
    personas: state.personas || [],
    activePersonaId: getActivePersona()?.id || "default_persona",
    customStateStages: state.customStateStages || {},
    customStateTypes: state.customStateTypes || {},
    apiSettings: state.apiSettings || {},
    apiKey: loadApiKey(),
    nordrouterApiKey: loadNordrouterApiKey(),
    totalSpent: state.totalSpent || 0,
    chatSummaries: state.chatSummaries || {},
    sessionMemories: state.sessionMemories || {},
    chatSummarizedMessageCount: state.chatSummarizedMessageCount || {},
    chatSummarySnapshots: state.chatSummarySnapshots || {},
    pinnedFacts: state.pinnedFacts || {},
    activeCharacterId: state.activeCharacterId || "",
    sidebarTab: state.sidebarTab || "characters"
  };

  const jsonString = JSON.stringify(payload, null, 2);

  if (typeof document !== "undefined" && document.createElement) {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openrouter_export_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return payload;
}

export function exportData() {
  return exportAllDataJSON();
}

export function clearEnvironment(options = {}) {
  // 1. Clear local storage
  clearAllStorageData();

  // 2. Abort active streaming request if any
  if (state.abortController) {
    try {
      state.abortController.abort();
    } catch (_e) {}
    state.abortController = null;
  }
  state.isStreaming = false;

  // 3. Reset in-memory state
  state.characters = loadCharacters(defaultCharacters);
  state.chats = {};
  state.globalSystemPrompt = "";
  state.chatStates = {};
  state.chatMetadata = {};
  state.customStateTypes = {};
  state.customStateStages = {};
  state.generatingStages = {};
  state.pendingStateProposals = {};
  state.apiLogs = [];
  state.apiSettings = normalizeApiSettings({});
  state.models = [];
  state.modelsMetadata = {};
  state.totalSpent = 0;
  state.chatSummaries = {};
  state.sessionMemories = {};
  state.chatSummarizedMessageCount = {};
  state.chatSummarySnapshots = {};
  state.pinnedFacts = {};
  state.gmScenes = [];
  state.activeGmSceneId = "";
  state.gmChats = {};
  state.sidebarTab = "characters";
  state.activeCharacterId = state.characters[0]?.id || "";
  state.selectedMessageIndex = null;
  state.historyStack = [];
  state.redoStack = [];
  state.charQuery = "";
  state.replyingToMessageIndex = null;
  state.wizardMessages = [];
  state.promptWizardMessages = [];

  // Save fresh clean defaults to storage
  saveCharacters(state.characters);
  saveApiSettings(state.apiSettings);
  savePersonas(loadPersonas());

  // 4. Update UI DOM input elements if present
  if (typeof document !== "undefined") {
    if (dom.globalSystemPromptInput) dom.globalSystemPromptInput.value = "";
    if (dom.apiKeyInput) dom.apiKeyInput.value = "";
    if (dom.customModelInput) dom.customModelInput.value = "";
    if (dom.customEvaluatorModelInput) dom.customEvaluatorModelInput.value = "";
    if (dom.customTranslationModelInput) dom.customTranslationModelInput.value = "";
    if (dom.customJevModelInput) dom.customJevModelInput.value = "";
    if (dom.localBaseUrlInput) dom.localBaseUrlInput.value = state.apiSettings.localBaseUrl;
    if (dom.localApiKeyInput) dom.localApiKeyInput.value = state.apiSettings.localApiKey;
    if (dom.nordrouterApiKeyInput) dom.nordrouterApiKeyInput.value = "";
    if (dom.nordrouterBaseUrlInput) dom.nordrouterBaseUrlInput.value = state.apiSettings.nordrouterBaseUrl || "https://nordrouter.com/v1";
    if (dom.temperatureInput) dom.temperatureInput.value = state.apiSettings.temperature;
    if (dom.repetitionPenaltyInput) dom.repetitionPenaltyInput.value = state.apiSettings.repetitionPenalty;
    if (dom.presencePenaltyInput) dom.presencePenaltyInput.value = state.apiSettings.presencePenalty;
    if (dom.frequencyPenaltyInput) dom.frequencyPenaltyInput.value = state.apiSettings.frequencyPenalty;
    if (dom.topPInput) dom.topPInput.value = state.apiSettings.topP;
    if (dom.minPInput) dom.minPInput.value = state.apiSettings.minP;
    if (dom.maxTokensInput) dom.maxTokensInput.value = state.apiSettings.maxTokens;

    renderPersonaList();
    renderGmScenes();
    updateActiveModelBadge();
  }

  return true;
}

export function clearData() {
  return clearEnvironment();
}

export function importDataFromFile(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (data.characters) {
        state.characters = data.characters;
        saveCharacters(state.characters);
      }
      if (data.chats) {
        state.chats = data.chats;
        saveChats(state.chats);
      }
      if (data.globalSystemPrompt !== undefined) {
        state.globalSystemPrompt = data.globalSystemPrompt;
        saveGlobalSystemPrompt(state.globalSystemPrompt);
        if (dom.globalSystemPromptInput) {
          dom.globalSystemPromptInput.value = state.globalSystemPrompt;
        }
      }
      if (data.chatStates) {
        state.chatStates = data.chatStates;
        saveChatStates(state.chatStates);
      }
      if (data.chatMetadata) {
        state.chatMetadata = data.chatMetadata;
        saveChatMetadata(state.chatMetadata);
      }
      if (data.models) {
        state.models = data.models;
        saveModelsCache(state.models);
      }
      if (data.modelsMetadata) {
        state.modelsMetadata = data.modelsMetadata;
        saveModelsMetadataCache(state.modelsMetadata);
      }
      if (data.gmScenes) {
        state.gmScenes = data.gmScenes;
        saveGmScenes(state.gmScenes);
        renderGmScenes();
      }
      if (data.gmChats) {
        state.gmChats = data.gmChats;
        saveGmChats(state.gmChats);
      }
      if (data.activeGmSceneId !== undefined) {
        state.activeGmSceneId = data.activeGmSceneId;
        saveActiveGmSceneId(state.activeGmSceneId);
      }
      if (data.personas) {
        state.personas = data.personas;
        savePersonas(state.personas);
        renderPersonaList();
      }
      if (data.customStateStages) {
        state.customStateStages = data.customStateStages;
        saveCustomStateStages(state.customStateStages);
      }
      if (data.customStateTypes) {
        state.customStateTypes = data.customStateTypes;
        saveCustomStateTypes(state.customStateTypes);
      }
      if (data.apiSettings) {
        state.apiSettings = normalizeApiSettings(data.apiSettings);
        saveApiSettings(state.apiSettings);
      }
      if (data.apiKey !== undefined) {
        saveApiKey(data.apiKey);
        if (dom.apiKeyInput) dom.apiKeyInput.value = data.apiKey;
      }
      if (data.nordrouterApiKey !== undefined) {
        saveNordrouterApiKey(data.nordrouterApiKey);
        if (dom.nordrouterApiKeyInput) dom.nordrouterApiKeyInput.value = data.nordrouterApiKey;
      }
      if (data.totalSpent !== undefined) {
        state.totalSpent = data.totalSpent;
        saveTotalSpent(state.totalSpent);
      }
      if (data.chatSummaries) {
        state.chatSummaries = data.chatSummaries;
        saveChatSummaries(state.chatSummaries);
      }
      if (data.sessionMemories) {
        state.sessionMemories = data.sessionMemories;
        saveSessionMemories(state.sessionMemories);
      }
      if (data.chatSummarizedMessageCount) {
        state.chatSummarizedMessageCount = data.chatSummarizedMessageCount;
        saveChatSummarizedMessageCount(state.chatSummarizedMessageCount);
      }
      if (data.chatSummarySnapshots) {
        state.chatSummarySnapshots = data.chatSummarySnapshots;
        saveChatSummarySnapshots(state.chatSummarySnapshots);
      }
      if (data.pinnedFacts) {
        state.pinnedFacts = data.pinnedFacts;
        savePinnedFacts(state.pinnedFacts);
      }
      if (data.sidebarTab) {
        state.sidebarTab = data.sidebarTab;
        saveSidebarTab(state.sidebarTab);
      }
      if (data.activeCharacterId) {
        state.activeCharacterId = data.activeCharacterId;
      }
      if (onSuccess) onSuccess();
    } catch (e) {
      if (onError) onError(e);
    }
  };
  reader.readAsText(file);
}

export function normalizeApiSettings(raw) {
  const parseNum = (val, fallback) => {
    if (val === undefined || val === null || String(val).trim() === "") return fallback;
    const cleaned = String(val).replace(',', '.').trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : fallback;
  };

  const temperature = parseNum(raw?.temperature, 0.68);
  const repetitionPenalty = parseNum(raw?.repetitionPenalty, 1.05);
  const presencePenalty = parseNum(raw?.presencePenalty, 0.15);
  const frequencyPenalty = parseNum(raw?.frequencyPenalty, 0.15);
  const topP = parseNum(raw?.topP, 0.95);
  const minP = parseNum(raw?.minP, 0.05);
  const maxTokens = parseNum(raw?.maxTokens, 800);
  const provider = String(raw?.apiProvider || "openrouter").trim();
  const defaultLocalUrl = provider === "kobold" ? "http://localhost:5001" : "http://localhost:1234/v1";
  return {
    apiProvider: provider,
    localBaseUrl: String(raw?.localBaseUrl || defaultLocalUrl).trim(),
    localApiKey: String(raw?.localApiKey || "lm-studio").trim(),
    nordrouterApiKey: String(raw?.nordrouterApiKey || "").trim(),
    nordrouterBaseUrl: String(raw?.nordrouterBaseUrl || "https://nordrouter.com/v1").trim(),
    selectedModel: String(raw?.selectedModel || "").trim(),
    temperature: Math.min(2, Math.max(0, temperature)),
    repetitionPenalty: Math.min(2, Math.max(0, repetitionPenalty)),
    presencePenalty: Math.min(2, Math.max(-2, presencePenalty)),
    frequencyPenalty: Math.min(2, Math.max(-2, frequencyPenalty)),
    topP: Math.min(1, Math.max(0, topP)),
    minP: Math.min(1, Math.max(0, minP)),
    maxTokens: Math.max(1, Math.floor(maxTokens)),
    thinkingDisplay: String(raw?.thinkingDisplay || (raw?.enableInnerMonologue === false ? "hidden" : "collapsed")).trim(),
    enableInnerMonologue: raw?.thinkingDisplay ? (raw.thinkingDisplay !== "hidden") : (raw?.enableInnerMonologue !== false),
    enableEvaluator: raw?.enableEvaluator !== false,
    userName: String(raw?.userName || "User").trim(),
    userPronouns: String(raw?.userPronouns || "he/him").trim(),
    responseLength: String(raw?.responseLength || "medium").trim(),
    evaluatorModel: String(raw?.evaluatorModel || "").trim(),
    translationModel: String(raw?.translationModel || raw?.selectedModel || "deepseek/deepseek-v4-flash").trim(),
    jevModel: String(raw?.jevModel || "").trim(),
    chatLanguage: String(raw?.chatLanguage || "ru").trim(),
    worldGenre: String(raw?.worldGenre || "fantasy").trim(),
    summaryMode: String(raw?.summaryMode || "every_turn").trim(),
    initiativeLevel: String(raw?.initiativeLevel || "balanced").trim(),
    maxHistoryMessages: parseNum(raw?.maxHistoryMessages, 20),
    providerSort: String(raw?.providerSort || "price").trim(),
    specificProvider: String(raw?.specificProvider || "").trim(),
    allowFallbacks: raw?.allowFallbacks !== false,
    stabsEdhEnabled: raw?.stabsEdhEnabled !== false,
    enableHiddenTraits: raw?.enableHiddenTraits !== false
  };
}

export function updateQuickModelSwitcherUI() {
  const selectedModel = (state.apiSettings?.selectedModel || "").trim();
  const lower = selectedModel.toLowerCase();

  const btn52 = dom.quickModelBtnGlm52 || document.getElementById("quickModelBtnGlm52");
  const btn53 = dom.quickModelBtnGlm53Flash || document.getElementById("quickModelBtnGlm53Flash");
  const activeLabel = dom.sidebarModelActiveName || document.getElementById("sidebarModelActiveName");

  const is53 = lower.includes("glm-5.3-flash") || lower.includes("glm-5.3");
  const is52 = !is53 && lower.includes("glm-5.2");

  if (btn52) {
    btn52.classList.toggle("active", is52);
  }
  if (btn53) {
    btn53.classList.toggle("active", is53);
  }

  if (activeLabel) {
    if (is53) {
      activeLabel.textContent = "GLM 5.3 Flash";
      activeLabel.title = `Активная модель: ${selectedModel}\nНажмите, чтобы открыть настройки`;
    } else if (is52) {
      activeLabel.textContent = "GLM 5.2";
      activeLabel.title = `Активная модель: ${selectedModel}\nНажмите, чтобы открыть настройки`;
    } else if (selectedModel) {
      const parts = selectedModel.split("/");
      const shortName = parts[parts.length - 1] || selectedModel;
      activeLabel.textContent = shortName;
      activeLabel.title = `Активная модель: ${selectedModel}\nНажмите, чтобы открыть настройки`;
    } else {
      activeLabel.textContent = "Не выбрана";
      activeLabel.title = "Модель не выбрана. Нажмите для настроек";
    }
  }
}

export function switchQuickModel(targetPrefix) {
  const is53 = String(targetPrefix).includes("5.3");
  let resolvedModel = is53 ? "z-ai/glm-5.3-flash" : "z-ai/glm-5.2";

  // Check if we have models in state.models that match
  if (Array.isArray(state.models) && state.models.length > 0) {
    if (is53) {
      const match = state.models.find(m => m.toLowerCase().includes("glm-5.3-flash")) ||
                    state.models.find(m => m.toLowerCase().includes("glm-5.3"));
      if (match) resolvedModel = match;
    } else {
      const match = state.models.find(m => m.toLowerCase() === "z-ai/glm-5.2") ||
                    state.models.find(m => m.toLowerCase().includes("glm-5.2"));
      if (match) resolvedModel = match;
    }
  }

  state.apiSettings.selectedModel = resolvedModel;
  saveApiSettings(state.apiSettings);

  if (dom.modelSelect) {
    if (![...dom.modelSelect.options].some(o => o.value === resolvedModel)) {
      const opt = document.createElement("option");
      opt.value = resolvedModel;
      opt.textContent = resolvedModel;
      dom.modelSelect.appendChild(opt);
    }
    dom.modelSelect.value = resolvedModel;
  }
  if (dom.customModelInput) {
    dom.customModelInput.value = resolvedModel;
  }

  const activeChar = state.characters?.find(c => c.id === state.activeCharacterId);
  if (activeChar) {
    activeChar.model = resolvedModel;
    saveCharacters(state.characters);
    if (dom.characterModelSelect && dom.characterId?.value === state.activeCharacterId) {
      dom.characterModelSelect.value = resolvedModel;
    }
  }

  updateActiveModelBadge();
  updateSettingsModelDetails();

  const friendlyName = is53 ? "GLM 5.3 Flash" : "GLM 5.2";
  return { modelId: resolvedModel, friendlyName };
}

export function updateActiveModelBadge() {
  if (dom.activeModelBadge) {
    const activeModel = state.apiSettings.selectedModel || "None";
    dom.activeModelBadge.textContent = activeModel;
    dom.activeModelBadge.title = `Model: ${activeModel} (нажмите для открытия настроек)`;
  }
  updateQuickModelSwitcherUI();
}

export function updateProviderUI() {
  const provider = state.apiSettings.apiProvider || "openrouter";
  if (provider === "nordrouter") {
    if (dom.openrouterFields) dom.openrouterFields.style.display = "none";
    if (dom.localLlmFields) dom.localLlmFields.style.display = "none";
    if (dom.nordrouterFields) dom.nordrouterFields.style.display = "block";
    if (dom.nordrouterBaseUrlInput && (!dom.nordrouterBaseUrlInput.value || dom.nordrouterBaseUrlInput.value === "http://localhost:1234/v1")) {
      dom.nordrouterBaseUrlInput.value = state.apiSettings.nordrouterBaseUrl || "https://nordrouter.com/v1";
    }
  } else if (provider === "local" || provider === "kobold") {
    if (dom.openrouterFields) dom.openrouterFields.style.display = "none";
    if (dom.nordrouterFields) dom.nordrouterFields.style.display = "none";
    if (dom.localLlmFields) dom.localLlmFields.style.display = "flex";
    
    const apiKeyLabel = dom.localApiKeyInput?.closest("label");
    if (apiKeyLabel) {
      apiKeyLabel.style.display = provider === "kobold" ? "none" : "block";
    }
    
    if (dom.localBaseUrlInput) {
      if (provider === "kobold") {
        if (!dom.localBaseUrlInput.value || dom.localBaseUrlInput.value === "http://localhost:1234/v1") {
          dom.localBaseUrlInput.placeholder = "http://localhost:5001";
        }
      } else {
        dom.localBaseUrlInput.placeholder = "http://localhost:1234/v1";
      }
    }
  } else {
    if (dom.openrouterFields) dom.openrouterFields.style.display = "block";
    if (dom.localLlmFields) dom.localLlmFields.style.display = "none";
    if (dom.nordrouterFields) dom.nordrouterFields.style.display = "none";
  }

  const isNord = provider === "nordrouter";
  const defaultJevModel = isNord ? "typesafe-ai/jev" : "~typesafe/jev-latest";
  if (dom.customJevModelInput) {
    dom.customJevModelInput.placeholder = `${defaultJevModel} (или введите вручную...)`;
  }
  if (dom.jevActiveModelName) {
    dom.jevActiveModelName.textContent = state.apiSettings.jevModel || defaultJevModel;
  }
}

/** Update thinking toggle button visual based on current state */
export function updateThinkingToggleVisual() {
  const btn = dom.thinkingToggleBtn;
  if (!btn) return;
  const isEnabled = state.apiSettings?.thinkingDisplay !== "hidden" && state.apiSettings?.enableInnerMonologue !== false;
  btn.classList.toggle("active", isEnabled);
  btn.classList.toggle("disabled", !isEnabled);
  btn.title = isEnabled
    ? "Размышления модели: ВКЛ (нажмите для отключения)"
    : "Размышления модели: ВЫКЛ (нажмите для включения)";
}

export function syncApiSettingsFromInputs() {
  const provider = dom.apiProviderSelect?.value || state.apiSettings.apiProvider || "openrouter";
  const selectedModel = dom.customModelInput?.value.trim() || dom.modelSelect?.value || state.apiSettings.selectedModel || "";
  const evaluatorModel = dom.customEvaluatorModelInput?.value.trim() || dom.evaluatorModelSelect?.value || state.apiSettings.evaluatorModel || "";
  const translationModel = dom.customTranslationModelInput?.value.trim() || dom.translationModelSelect?.value || state.apiSettings.translationModel || "";
  const jevModel = dom.customJevModelInput?.value.trim() || dom.jevModelSelect?.value || state.apiSettings.jevModel || "";

  const getInputValue = (el, fallback) => {
    if (!el || el.value === undefined || el.value === null || String(el.value).trim() === "") {
      return fallback;
    }
    return el.value;
  };

  state.apiSettings = normalizeApiSettings({
    ...state.apiSettings,
    apiProvider: provider,
    localBaseUrl: getInputValue(dom.localBaseUrlInput, state.apiSettings.localBaseUrl),
    localApiKey: getInputValue(dom.localApiKeyInput, state.apiSettings.localApiKey),
    nordrouterApiKey: getInputValue(dom.nordrouterApiKeyInput, state.apiSettings.nordrouterApiKey),
    nordrouterBaseUrl: getInputValue(dom.nordrouterBaseUrlInput, state.apiSettings.nordrouterBaseUrl || "https://nordrouter.com/v1"),
    selectedModel: selectedModel,
    evaluatorModel: evaluatorModel,
    translationModel: translationModel,
    jevModel: jevModel,
    temperature: getInputValue(dom.temperatureInput, state.apiSettings.temperature),
    repetitionPenalty: getInputValue(dom.repetitionPenaltyInput, state.apiSettings.repetitionPenalty),
    presencePenalty: getInputValue(dom.presencePenaltyInput, state.apiSettings.presencePenalty),
    frequencyPenalty: getInputValue(dom.frequencyPenaltyInput, state.apiSettings.frequencyPenalty),
    topP: getInputValue(dom.topPInput, state.apiSettings.topP),
    minP: getInputValue(dom.minPInput, state.apiSettings.minP),
    maxTokens: getInputValue(dom.maxTokensInput, state.apiSettings.maxTokens),
    thinkingDisplay: dom.thinkingDisplaySelect?.value || (dom.enableInnerMonologueInput?.checked === false ? "hidden" : (state.apiSettings.thinkingDisplay || "collapsed")),
    enableInnerMonologue: dom.thinkingDisplaySelect ? (dom.thinkingDisplaySelect.value !== "hidden") : (dom.enableInnerMonologueInput ? dom.enableInnerMonologueInput.checked : (state.apiSettings.enableInnerMonologue !== false)),
    enableEvaluator: dom.enableEvaluatorInput ? dom.enableEvaluatorInput.checked : (state.apiSettings.enableEvaluator !== false),
    userName: getInputValue(dom.userNameInput, state.apiSettings.userName),
    userPronouns: dom.userPronounsSelect?.value || state.apiSettings.userPronouns,
    responseLength: dom.responseLengthSelect?.value || state.apiSettings.responseLength,
    chatLanguage: dom.chatLanguageSelect?.value || state.apiSettings.chatLanguage || "ru",
    worldGenre: dom.worldGenreSelect?.value || state.apiSettings.worldGenre || "fantasy",
    summaryMode: dom.summaryModeSelect?.value || state.apiSettings.summaryMode || "every_turn",
    initiativeLevel: dom.initiativeLevelSelect?.value || state.apiSettings.initiativeLevel || "balanced",
    maxHistoryMessages: dom.maxHistoryMessagesSelect ? Number(dom.maxHistoryMessagesSelect.value) : (state.apiSettings.maxHistoryMessages ?? 20),
    providerSort: dom.providerSortSelect?.value || state.apiSettings.providerSort || "price",
    specificProvider: (dom.specificProviderSelect?.value !== undefined ? dom.specificProviderSelect.value : (dom.specificProviderInput?.value || state.apiSettings.specificProvider || "")).trim(),
    allowFallbacks: dom.allowFallbacksInput ? dom.allowFallbacksInput.checked : (state.apiSettings.allowFallbacks !== false),
    stabsEdhEnabled: dom.stabsEdhToggle ? dom.stabsEdhToggle.checked : (state.apiSettings.stabsEdhEnabled !== false),
    enableHiddenTraits: dom.enableHiddenTraitsToggle ? dom.enableHiddenTraitsToggle.checked : (state.apiSettings.enableHiddenTraits !== false)
  });
  if (dom.specificProviderInput) dom.specificProviderInput.value = state.apiSettings.specificProvider || "";
  if (dom.nordrouterApiKeyInput && dom.nordrouterApiKeyInput.value !== undefined) {
    saveNordrouterApiKey(dom.nordrouterApiKeyInput.value);
  }
  if (dom.apiKeyInput && dom.apiKeyInput.value !== undefined) {
    saveApiKey(dom.apiKeyInput.value);
  }
  if (dom.globalSystemPromptInput && dom.globalSystemPromptInput.value !== undefined) {
    state.globalSystemPrompt = dom.globalSystemPromptInput.value;
    saveGlobalSystemPrompt(state.globalSystemPrompt);
  }
  saveApiSettings(state.apiSettings);
  updateActiveModelBadge();
  updateSettingsModelDetails();
  updateThinkingToggleVisual();

  const activeChar = state.characters.find(c => c.id === state.activeCharacterId);
  if (activeChar && selectedModel) {
    activeChar.model = selectedModel;
    saveCharacters(state.characters);
    if (dom.characterModelSelect && dom.characterId?.value === state.activeCharacterId) {
      dom.characterModelSelect.value = selectedModel;
    }
  }

  // Keep active persona in sync with Settings page inputs
  const activePersona = getActivePersona();
  if (activePersona) {
    let changed = false;
    if (dom.userNameInput && activePersona.userName !== dom.userNameInput.value.trim()) {
      activePersona.userName = dom.userNameInput.value.trim();
      changed = true;
    }
    if (dom.userPronounsSelect && activePersona.userPronouns !== dom.userPronounsSelect.value) {
      activePersona.userPronouns = dom.userPronounsSelect.value;
      changed = true;
    }
    if (changed) {
      const personas = loadPersonas();
      const idx = personas.findIndex(p => p.id === activePersona.id);
      if (idx !== -1) {
        personas[idx] = activePersona;
        savePersonas(personas);
        renderPersonaList();
      }
    }
  }
}

export function ensureModelSelection() {
  const characterModel = getActiveCharacter()?.model || "";
  const fallbackModel = state.models[0] || characterModel || "openai/gpt-4o-mini";
  const selectedModel = state.apiSettings.selectedModel || fallbackModel;
  if (!state.models.includes(selectedModel)) {
    state.models = [...new Set([selectedModel, ...state.models])];
  }
  state.apiSettings.selectedModel = selectedModel;

  const evaluatorModel = state.apiSettings.evaluatorModel || selectedModel;
  if (!state.models.includes(evaluatorModel)) {
    state.models = [...new Set([evaluatorModel, ...state.models])];
  }
  state.apiSettings.evaluatorModel = evaluatorModel;
}

function getModelDisplayName(model) {
  let text = model;
  const details = state.modelsMetadata?.[model];
  if (details && details.pricing) {
    const pCost = (parseFloat(details.pricing.prompt) * 1000000).toFixed(2);
    const cCost = (parseFloat(details.pricing.completion) * 1000000).toFixed(2);
    if (pCost > 0 || cCost > 0) {
      text += ` ($${pCost}/1M | $${cCost}/1M)`;
    } else {
      text += ` (Free)`;
    }
  }
  return text;
}

export function renderModelOptions() {
  ensureModelSelection();
  if (dom.modelSelect) {
    dom.modelSelect.innerHTML = "";
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = getModelDisplayName(model);
      dom.modelSelect.appendChild(option);
    }
    dom.modelSelect.value = state.apiSettings.selectedModel;
  }
  if (dom.wizardModelSelect) {
    dom.wizardModelSelect.innerHTML = "";
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = getModelDisplayName(model);
      dom.wizardModelSelect.appendChild(option);
    }
    dom.wizardModelSelect.value = state.wizardModel || state.apiSettings.selectedModel || "openai/gpt-4o-mini";
  }
  if (dom.cardImportModelSelect) {
    dom.cardImportModelSelect.innerHTML = "";
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = getModelDisplayName(model);
      dom.cardImportModelSelect.appendChild(option);
    }
    dom.cardImportModelSelect.value = state.cardImportModel || state.wizardModel || state.apiSettings.selectedModel || "openai/gpt-4o-mini";
  }
  if (dom.enhancerModelSelect) {
    dom.enhancerModelSelect.innerHTML = "";
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = getModelDisplayName(model);
      dom.enhancerModelSelect.appendChild(option);
    }
    dom.enhancerModelSelect.value = state.enhancerModel || state.wizardModel || state.apiSettings.selectedModel || "openai/gpt-4o-mini";
  }
  if (dom.characterModelSelect) {
    dom.characterModelSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Использовать глобальную модель (Use Global Model)";
    dom.characterModelSelect.appendChild(defaultOption);
    
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = getModelDisplayName(model);
      dom.characterModelSelect.appendChild(option);
    }
    const activeAdminChar = state.characters.find(c => c.id === dom.characterId?.value);
    dom.characterModelSelect.value = activeAdminChar?.model || "";
  }
  if (dom.evaluatorModelSelect) {
    dom.evaluatorModelSelect.innerHTML = "";
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = getModelDisplayName(model);
      dom.evaluatorModelSelect.appendChild(option);
    }
    dom.evaluatorModelSelect.value = state.apiSettings.evaluatorModel || state.apiSettings.selectedModel || "openai/gpt-4o-mini";
  }
  if (dom.translationModelSelect) {
    dom.translationModelSelect.innerHTML = "";
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = getModelDisplayName(model);
      dom.translationModelSelect.appendChild(option);
    }
    dom.translationModelSelect.value = state.apiSettings.translationModel || state.apiSettings.selectedModel || "deepseek/deepseek-v4-flash";
  }
  if (dom.customModelInput) {
    dom.customModelInput.value = state.apiSettings.selectedModel;
  }
  if (dom.customEvaluatorModelInput) {
    dom.customEvaluatorModelInput.value = state.apiSettings.evaluatorModel || state.apiSettings.selectedModel || "openai/gpt-4o-mini";
  }
  if (dom.customTranslationModelInput) {
    dom.customTranslationModelInput.value = state.apiSettings.translationModel || state.apiSettings.selectedModel || "deepseek/deepseek-v4-flash";
  }
  const isNord = state.apiSettings.apiProvider === "nordrouter";
  const defaultJevModel = isNord ? "typesafe-ai/jev" : "~typesafe/jev-latest";
  const activeJevModel = state.apiSettings.jevModel || defaultJevModel;

  if (dom.jevModelSelect) {
    dom.jevModelSelect.innerHTML = "";
    const jevPresets = [
      { id: "~typesafe/jev-latest", label: "~typesafe/jev-latest (OpenRouter, дефолт)" },
      { id: "typesafe-ai/jev", label: "typesafe-ai/jev (NordRouter, дефолт)" },
      { id: "~typesafe/jev", label: "~typesafe/jev (OpenRouter Legacy)" }
    ];

    const allPresets = [...jevPresets];
    if (activeJevModel && !allPresets.some(p => p.id === activeJevModel)) {
      allPresets.push({ id: activeJevModel, label: `${activeJevModel} (Пользовательская)` });
    }

    for (const preset of allPresets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      dom.jevModelSelect.appendChild(option);
    }
    dom.jevModelSelect.value = activeJevModel;
  }
  if (dom.customJevModelInput) {
    dom.customJevModelInput.value = state.apiSettings.jevModel || "";
    dom.customJevModelInput.placeholder = `${defaultJevModel} (или введите вручную...)`;
  }
  if (dom.jevActiveModelName) {
    dom.jevActiveModelName.textContent = activeJevModel;
  }
  if (dom.temperatureInput) {
    dom.temperatureInput.value = String(state.apiSettings.temperature);
  }
  if (dom.repetitionPenaltyInput) {
    dom.repetitionPenaltyInput.value = String(state.apiSettings.repetitionPenalty ?? 1.0);
  }
  if (dom.presencePenaltyInput) {
    dom.presencePenaltyInput.value = String(state.apiSettings.presencePenalty ?? 0.7);
  }
  if (dom.frequencyPenaltyInput) {
    dom.frequencyPenaltyInput.value = String(state.apiSettings.frequencyPenalty ?? 0.65);
  }
  if (dom.topPInput) {
    dom.topPInput.value = String(state.apiSettings.topP ?? 1.0);
  }
  if (dom.minPInput) {
    dom.minPInput.value = String(state.apiSettings.minP ?? 0.0);
  }
  if (dom.maxTokensInput) {
    dom.maxTokensInput.value = String(state.apiSettings.maxTokens);
  }
  if (dom.thinkingDisplaySelect) {
    dom.thinkingDisplaySelect.value = state.apiSettings.thinkingDisplay || (state.apiSettings.enableInnerMonologue === false ? "hidden" : "collapsed");
  }
  if (dom.enableInnerMonologueInput) {
    dom.enableInnerMonologueInput.checked = (state.apiSettings.thinkingDisplay !== "hidden") && (state.apiSettings.enableInnerMonologue !== false);
  }
  updateThinkingToggleVisual();
  if (dom.enableEvaluatorInput) {
    dom.enableEvaluatorInput.checked = state.apiSettings.enableEvaluator !== false;
  }
  if (dom.stabsEdhToggle) {
    dom.stabsEdhToggle.checked = state.apiSettings.stabsEdhEnabled !== false;
  }
  if (dom.enableHiddenTraitsToggle) {
    dom.enableHiddenTraitsToggle.checked = state.apiSettings.enableHiddenTraits !== false;
  }
  if (dom.userNameInput) dom.userNameInput.value = state.apiSettings.userName || "User";
  if (dom.userPronounsSelect) dom.userPronounsSelect.value = state.apiSettings.userPronouns || "he/him";
  if (dom.responseLengthSelect) dom.responseLengthSelect.value = state.apiSettings.responseLength || "medium";
  if (dom.chatLanguageSelect) dom.chatLanguageSelect.value = state.apiSettings.chatLanguage || "ru";
  if (dom.worldGenreSelect) dom.worldGenreSelect.value = state.apiSettings.worldGenre || "fantasy";
  if (dom.summaryModeSelect) dom.summaryModeSelect.value = state.apiSettings.summaryMode || "every_turn";
  if (dom.initiativeLevelSelect) dom.initiativeLevelSelect.value = state.apiSettings.initiativeLevel || "balanced";
  if (dom.maxHistoryMessagesSelect) dom.maxHistoryMessagesSelect.value = String(state.apiSettings.maxHistoryMessages ?? 20);
  if (dom.providerSortSelect) dom.providerSortSelect.value = state.apiSettings.providerSort || "price";
  if (dom.specificProviderSelect) dom.specificProviderSelect.value = state.apiSettings.specificProvider || "";
  if (dom.apiProviderSelect) dom.apiProviderSelect.value = state.apiSettings.apiProvider || "openrouter";
  if (dom.apiKeyInput) dom.apiKeyInput.value = loadApiKey() || "";
  if (dom.nordrouterApiKeyInput) {
    dom.nordrouterApiKeyInput.value = state.apiSettings.nordrouterApiKey || loadNordrouterApiKey() || "";
  }
  if (dom.nordrouterBaseUrlInput) {
    dom.nordrouterBaseUrlInput.value = state.apiSettings.nordrouterBaseUrl || "https://nordrouter.com/v1";
  }
  if (dom.localBaseUrlInput) {
    dom.localBaseUrlInput.value = state.apiSettings.localBaseUrl || "http://localhost:1234/v1";
  }
  if (dom.localApiKeyInput) {
    dom.localApiKeyInput.value = state.apiSettings.localApiKey || "lm-studio";
  }
  if (dom.globalSystemPromptInput) {
    dom.globalSystemPromptInput.value = state.globalSystemPrompt || "";
  }
  if (dom.specificProviderInput) dom.specificProviderInput.value = state.apiSettings.specificProvider || "";
  if (dom.allowFallbacksInput) dom.allowFallbacksInput.checked = state.apiSettings.allowFallbacks !== false;
  updateProviderUI();
  updateActiveModelBadge();
  updateSettingsModelDetails();
}

let isSavingSettings = false;
export function saveSettingsFromDialog(options = { showNotification: true, closeDialog: true }) {
  if (isSavingSettings) return;
  isSavingSettings = true;
  try {
    syncApiSettingsFromInputs();
    if (options.showNotification && typeof showStateNotification === "function") {
      showStateNotification("Настройки сохранены! ✅");
    }
    if (options.closeDialog && dom.settingsDialog && dom.settingsDialog.open) {
      dom.settingsDialog.close();
    }
  } finally {
    isSavingSettings = false;
  }
}

export function updateSettingsModelDetails() {
  const modelId = state.apiSettings.selectedModel;
  const details = state.modelsMetadata?.[modelId];
  if (dom.settingsModelDetails) {
    if (details) {
      const promptCost = (parseFloat(details.pricing?.prompt || 0) * 1000000).toFixed(2);
      const completionCost = (parseFloat(details.pricing?.completion || 0) * 1000000).toFixed(2);
      const contextLen = details.context_length ? (details.context_length / 1024).toFixed(0) + "k" : "unknown";
      
      dom.settingsModelDetails.innerHTML = `
        <strong>Context Limit:</strong> ${contextLen} tokens<br>
        <strong>Pricing per 1M tokens:</strong> Prompt: $${promptCost} | Completion: $${completionCost}
      `;
      dom.settingsModelDetails.style.display = "block";
    } else {
      dom.settingsModelDetails.style.display = "none";
    }
  }
  updateModelProvidersUI(modelId);
}

export async function updateModelProvidersUI(modelId) {
  const currentModel = modelId || state.apiSettings.selectedModel;
  if (!dom.specificProviderSelect) return;

  const select = dom.specificProviderSelect;
  const statusEl = dom.specificProviderStatus;
  const currentVal = state.apiSettings.specificProvider || "";

  if (!currentModel || (state.apiSettings.apiProvider && state.apiSettings.apiProvider !== "openrouter")) {
    select.innerHTML = '<option value="">🌐 Автовыбор (Любой / Auto-route)</option>';
    if (statusEl) statusEl.textContent = "";
    return;
  }

  // Check if we have cached endpoints
  const cached = state.modelEndpointsCache?.[currentModel];
  if (!cached || cached.length === 0) {
    if (statusEl) statusEl.textContent = "⏳ Загрузка провайдеров модели...";
  }

  try {
    const endpoints = await fetchModelEndpoints(currentModel);
    
    // Guard against race condition if active model changed while waiting
    if (state.apiSettings.selectedModel !== currentModel) {
      return;
    }

    select.innerHTML = '<option value="">🌐 Автовыбор (Любой / Auto-route)</option>';

    if (endpoints && endpoints.length > 0) {
      endpoints.forEach(ep => {
        const opt = document.createElement("option");
        opt.value = ep.providerName;

        let label = ep.providerName;
        const details = [];
        if (ep.promptPrice !== null && ep.completionPrice !== null) {
          const promptM = (ep.promptPrice * 1000000).toFixed(2);
          const compM = (ep.completionPrice * 1000000).toFixed(2);
          details.push(`In: $${promptM} / Out: $${compM}`);
        }
        if (ep.contextLength) {
          details.push(`${Math.round(ep.contextLength / 1024)}k ctx`);
        }
        if (ep.quantization) {
          details.push(ep.quantization.toUpperCase());
        }
        if (details.length > 0) {
          label += ` — ${details.join(" | ")}`;
        }
        opt.textContent = label;
        select.appendChild(opt);
      });

      if (currentVal) {
        const exists = endpoints.some(ep => ep.providerName.toLowerCase() === currentVal.toLowerCase());
        if (exists) {
          const matched = endpoints.find(ep => ep.providerName.toLowerCase() === currentVal.toLowerCase());
          select.value = matched.providerName;
        } else {
          const customOpt = document.createElement("option");
          customOpt.value = currentVal;
          customOpt.textContent = `⚙️ ${currentVal} (кастомный)`;
          select.appendChild(customOpt);
          select.value = currentVal;
        }
      } else {
        select.value = "";
      }

      if (statusEl) {
        statusEl.textContent = `Доступно провайдеров для ${currentModel}: ${endpoints.length}`;
      }
    } else {
      if (currentVal) {
        const customOpt = document.createElement("option");
        customOpt.value = currentVal;
        customOpt.textContent = `⚙️ ${currentVal}`;
        select.appendChild(customOpt);
        select.value = currentVal;
      }
      if (statusEl) {
        statusEl.textContent = "";
      }
    }
  } catch (err) {
    console.warn("[Config] Error updating model providers UI:", err);
    if (statusEl) statusEl.textContent = "";
  }
}
