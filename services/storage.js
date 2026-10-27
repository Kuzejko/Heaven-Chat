const CHARACTERS_KEY = "openrouter_characters_v1";
const CHATS_KEY = "openrouter_chats_v1";
const API_KEY = "openrouter_api_key_v1";
const API_SETTINGS_KEY = "openrouter_api_settings_v1";
const MODELS_CACHE_KEY = "openrouter_models_cache_v1";
const GLOBAL_SYSTEM_PROMPT_KEY = "openrouter_global_system_prompt_v1";
const CHAT_STATES_KEY = "openrouter_chat_states_v1";
const CHARACTER_AI_DEFAULTS_KEY = "openrouter_character_ai_defaults_v1";
const CUSTOM_STATE_TYPES_KEY = "openrouter_custom_state_types_v1";
const CUSTOM_STATE_STAGES_KEY = "openrouter_custom_state_stages_v1";
const CHAT_METADATA_KEY = "openrouter_chat_metadata_v1";
const NORDRUTER_API_KEY = "nordrouter_api_key_v1";

// Resolves Issue 10 (renamed to distinguish from undo/redo HISTORY_LIMIT)
const CHAT_HISTORY_LIMIT = 200;

// IndexedDB persistence fallback
const DB_NAME = "openrouter_db";
const DB_VERSION = 1;
const STORE_NAME = "kv_store";

function getDB() {
  if (typeof indexedDB === "undefined") return Promise.reject("IndexedDB not supported");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function idbGet(key) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

export async function idbSet(key, value) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {}
}

export async function idbRemove(key) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {}
}

// Helper to safely write to storage, catching QuotaExceededError and using IndexedDB fallback
function safeLocalStorageSet(key, value) {
  // Always asynchronously persist to IndexedDB as reliable backup
  idbSet(key, value);

  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[Storage] Quota exceeded for "${key}", attempting automatic cleanup...`);
    try {
      // Attempt 1: Clear non-essential cache keys from localStorage
      localStorage.removeItem(MODELS_CACHE_KEY);
      localStorage.removeItem(CHAT_SUMMARY_SNAPSHOTS_KEY);
      localStorage.removeItem(CHAT_SUMMARIES_KEY);
      localStorage.removeItem(GM_CHATS_KEY);
      localStorage.removeItem(MODELS_METADATA_KEY);
      localStorage.removeItem(CHARACTER_AI_DEFAULTS_KEY);

      localStorage.setItem(key, value);
      return;
    } catch (_retryErr) {
      // Attempt 2: If saving chats, prune old chat history if data is too large
      if (key === CHATS_KEY && typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === "object") {
            const pruned = {};
            for (const charId in parsed) {
              if (Array.isArray(parsed[charId])) {
                pruned[charId] = parsed[charId].slice(-30);
              } else {
                pruned[charId] = parsed[charId];
              }
            }
            const prunedStr = JSON.stringify(pruned);
            localStorage.setItem(key, prunedStr);
            idbSet(key, prunedStr);
            return;
          }
        } catch (_pruneErr) {}
      }
    }

    console.warn(`[Storage] Key "${key}" saved in IndexedDB persistent storage.`);
  }
}

export async function syncStorageFromIndexedDB(state, onUpdate) {
  if (!state) return;
  try {
    let updated = false;

    // 1. Sync Characters
    const idbCharsRaw = await idbGet(CHARACTERS_KEY);
    if (idbCharsRaw) {
      const idbChars = safeJsonParse(idbCharsRaw, null);
      if (Array.isArray(idbChars) && idbChars.length > 0) {
        const existingMap = new Map((state.characters || []).map(c => [c.id, c]));
        let addedCount = 0;
        for (const char of idbChars) {
          if (!existingMap.has(char.id)) {
            existingMap.set(char.id, normalizeCharacter(char));
            addedCount++;
          }
        }
        if (addedCount > 0) {
          state.characters = Array.from(existingMap.values());
          saveCharacters(state.characters);
          updated = true;
        }
      }
    }

    // 2. Sync Chats
    const idbChatsRaw = await idbGet(CHATS_KEY);
    if (idbChatsRaw) {
      const idbChats = safeJsonParse(idbChatsRaw, null);
      if (idbChats && typeof idbChats === "object") {
        state.chats = state.chats || {};
        let chatsUpdated = false;
        for (const charId in idbChats) {
          const idbHistory = idbChats[charId] || [];
          const currentHistory = state.chats[charId] || [];
          if (idbHistory.length > currentHistory.length) {
            state.chats[charId] = idbHistory;
            chatsUpdated = true;
          }
        }
        if (chatsUpdated) {
          saveChats(state.chats);
          updated = true;
        }
      }
    }

    if (updated && typeof onUpdate === "function") {
      onUpdate();
    }
  } catch (e) {
    console.error("[Storage Sync Error]", e);
  }
}

// Типы данных для состояний
export const STATE_TYPES = {
  string: { render: "text" },
  number: { render: "range", min: 0, max: 100, step: 1 },
  boolean: { render: "checkbox" },
  list: { render: "tags" },
  mood: {
    render: "select",
    options: ["happy", "sad", "angry", "flirty", "neutral", "excited", "nervous"]
  }
};

export const MOOD_BEHAVIORS = {
  happy: "Cheerful, warm, eager to engage. Laughs easily, shares freely.",
  sad: "Withdrawn, quiet, seeking comfort. Responses are slower and softer.",
  angry: "Sharp, defensive, irritable. May lash out or be confrontational.",
  flirty: "Playful, teasing, physically expressive. Seeks closeness and attention.",
  neutral: "Calm, measured, observant. Responds thoughtfully without strong bias.",
  excited: "Energetic, enthusiastic, talkative. Easily impressed, quick to act.",
  nervous: "Hesitant, fidgety, second-guessing. May avoid eye contact or stutter."
};

export const STAGE_THRESHOLDS = [
  { max: 10, stage: "Stranger", behavior: "Distant and guarded. Minimal personal disclosure. Polite or cautious. Evaluates the user, protects own boundaries, and asks clarifying questions." },
  { max: 25, stage: "Acquaintance", behavior: "Cordial but cautious. Willing to converse. Shares opinions and engages naturally while keeping personal boundaries." },
  { max: 40, stage: "Familiar", behavior: "Friendly and relaxed. Shares opinions freely. Starts showing genuine interest. Occasionally initiates topics." },
  { max: 55, stage: "Friend", behavior: "Warm and open. Shares personal stories. Shows concern for the other's wellbeing. Comfortable with casual touch." },
  { max: 70, stage: "Close Friend", behavior: "Deeply trusting and protective. Shares secrets and vulnerabilities. Goes out of their way to help. Physically affectionate." },
  { max: 85, stage: "Intimate", behavior: "Emotionally bonded. Expresses feelings openly. Prioritizes the relationship. Comfortable with vulnerability and deep closeness." },
  { max: 100, stage: "Soulmate", behavior: "Completely devoted. Finishes sentences. Deep empathy and understanding. Unshakable loyalty. The relationship defines them." }
];



export function getStageBehavior(stage) {
  const normalizedStage = stage === "Partner" ? "Intimate" : stage;
  const found = STAGE_THRESHOLDS.find(t => t.stage.toLowerCase() === (normalizedStage || "").toLowerCase());
  return found ? found.behavior : STAGE_THRESHOLDS[0].behavior;
}

export const BUILTIN_STATES = {
  mood: { 
    type: "mood", default: "neutral", 
    label: "Mood", 
    description: "Current emotional state",
    color: "#ffffff"
  },
  relationshipStage: { 
    type: "string", default: "Stranger", 
    label: "Stage", 
    description: "Current progression of the relationship",
    color: "#e4e4e7"
  }
};

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function normalizeCharacter(character) {
  return {
    name: "Unnamed",
    personality: "",
    scenario: "",
    description: "",
    systemPrompt: "",
    firstMessage: "",
    model: "openai/gpt-4o-mini",
    ...character
  };
}

export function loadCharacters(defaultCharacters) {
  const stored = safeJsonParse(localStorage.getItem(CHARACTERS_KEY), null);
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map(normalizeCharacter);
  }
  const normalizedDefaults = defaultCharacters.map(normalizeCharacter);
  safeLocalStorageSet(CHARACTERS_KEY, JSON.stringify(normalizedDefaults));
  return normalizedDefaults;
}

export function saveCharacters(characters) {
  safeLocalStorageSet(CHARACTERS_KEY, JSON.stringify(characters));
}

export function loadChats() {
  const stored = safeJsonParse(localStorage.getItem(CHATS_KEY), {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveChats(chats) {
  safeLocalStorageSet(CHATS_KEY, JSON.stringify(chats));
}

export function appendMessage(chats, characterId, message) {
  const chat = Array.isArray(chats[characterId]) ? chats[characterId] : [];
  const nextChat = [...chat, message].slice(-CHAT_HISTORY_LIMIT);
  return { ...chats, [characterId]: nextChat };
}

export function replaceLastAssistantMessage(chats, characterId, content) {
  const chat = Array.isArray(chats[characterId]) ? [...chats[characterId]] : [];
  if (!chat.length) {
    return chats;
  }
  const lastIdx = chat.length - 1;
  if (chat[lastIdx].role !== "assistant") {
    return chats;
  }
  const existingMsg = chat[lastIdx];
  let updatedMsg = { ...existingMsg, content };
  if (Array.isArray(existingMsg.swipes) && existingMsg.swipes.length > 0) {
    const sIdx = (typeof existingMsg.swipeIndex === "number" && existingMsg.swipeIndex >= 0 && existingMsg.swipeIndex < existingMsg.swipes.length)
      ? existingMsg.swipeIndex
      : (existingMsg.swipes.length - 1);
    const updatedSwipes = [...existingMsg.swipes];
    updatedSwipes[sIdx] = content;
    updatedMsg.swipes = updatedSwipes;
    updatedMsg.swipeIndex = sIdx;
  }
  chat[lastIdx] = updatedMsg;
  return { ...chats, [characterId]: chat };
}

export function deleteCharacterChats(chats, characterId) {
  const next = { ...chats };
  delete next[characterId];
  return next;
}

export function loadApiKey() {
  return localStorage.getItem(API_KEY) || "";
}

export function saveApiKey(value) {
  safeLocalStorageSet(API_KEY, value.trim());
}

export function loadNordrouterApiKey() {
  return localStorage.getItem(NORDRUTER_API_KEY) || "";
}

export function saveNordrouterApiKey(value) {
  safeLocalStorageSet(NORDRUTER_API_KEY, (value || "").trim());
}

export function loadApiSettings() {
  const defaults = {
    apiProvider: "openrouter",
    localBaseUrl: "http://localhost:1234/v1",
    localApiKey: "lm-studio",
    nordrouterApiKey: "",
    nordrouterBaseUrl: "https://nordrouter.com/v1",
    selectedModel: "",
    evaluatorModel: "",
    translationModel: "",
    jevModel: "",
    temperature: 0.68,
    repetitionPenalty: 1.05,
    presencePenalty: 0.15,
    frequencyPenalty: 0.15,
    topP: 0.95,
    minP: 0.05,
    maxTokens: 800,
    enableInnerMonologue: true,
    enableHiddenTraits: true,
    thinkingDisplay: "collapsed",
    initiativeLevel: "balanced"
  };
  const stored = safeJsonParse(localStorage.getItem(API_SETTINGS_KEY), {});
  const merged = {
    ...defaults,
    ...stored
  };
  if (typeof merged.temperature === "number" && !isNaN(merged.temperature)) {
    merged.temperature = Math.min(2, Math.max(0, merged.temperature));
  } else {
    merged.temperature = 0.68;
  }
  if (typeof merged.repetitionPenalty === "number" && !isNaN(merged.repetitionPenalty)) {
    merged.repetitionPenalty = Math.min(2, Math.max(0, merged.repetitionPenalty));
  } else {
    merged.repetitionPenalty = 1.05;
  }
  if (typeof merged.presencePenalty === "number" && !isNaN(merged.presencePenalty)) {
    merged.presencePenalty = Math.min(2, Math.max(-2, merged.presencePenalty));
  } else {
    merged.presencePenalty = 0.15;
  }
  if (typeof merged.frequencyPenalty === "number" && !isNaN(merged.frequencyPenalty)) {
    merged.frequencyPenalty = Math.min(2, Math.max(-2, merged.frequencyPenalty));
  } else {
    merged.frequencyPenalty = 0.15;
  }
  if (typeof merged.topP === "number" && !isNaN(merged.topP)) {
    merged.topP = Math.min(1, Math.max(0, merged.topP));
  } else {
    merged.topP = 0.95;
  }
  if (typeof merged.minP === "number" && !isNaN(merged.minP)) {
    merged.minP = Math.min(1, Math.max(0, merged.minP));
  } else {
    merged.minP = 0.05;
  }
  if (typeof merged.maxTokens === "number" && !isNaN(merged.maxTokens)) {
    merged.maxTokens = Math.max(1, Math.floor(merged.maxTokens));
  } else {
    merged.maxTokens = 800;
  }
  return merged;
}

export function saveApiSettings(settings) {
  safeLocalStorageSet(API_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadModelsCache() {
  const cached = safeJsonParse(localStorage.getItem(MODELS_CACHE_KEY), []);
  return Array.isArray(cached) ? cached : [];
}

export function saveModelsCache(models) {
  safeLocalStorageSet(MODELS_CACHE_KEY, JSON.stringify(models));
}

export function loadGlobalSystemPrompt() {
  return localStorage.getItem(GLOBAL_SYSTEM_PROMPT_KEY) || "";
}

export function saveGlobalSystemPrompt(value) {
  safeLocalStorageSet(GLOBAL_SYSTEM_PROMPT_KEY, value || "");
}

export function loadChatStates() {
  const stored = safeJsonParse(localStorage.getItem(CHAT_STATES_KEY), {});
  return stored && typeof stored === "object" ? stored : {};
}

export function saveChatStates(statesByChat) {
  safeLocalStorageSet(CHAT_STATES_KEY, JSON.stringify(statesByChat));
}

export function loadCharacterAiDefaults() {
  return safeJsonParse(localStorage.getItem(CHARACTER_AI_DEFAULTS_KEY), {});
}

export function saveCharacterAiDefaults(defaultsByCharacter) {
  safeLocalStorageSet(CHARACTER_AI_DEFAULTS_KEY, JSON.stringify(defaultsByCharacter));
}

export function loadCustomStateTypes() {
  return safeJsonParse(localStorage.getItem(CUSTOM_STATE_TYPES_KEY), {});
}

export function saveCustomStateTypes(types) {
  safeLocalStorageSet(CUSTOM_STATE_TYPES_KEY, JSON.stringify(types));
}

export function isBuiltinState(key) {
  return key in BUILTIN_STATES;
}

const RESERVED_STATE_KEYS = new Set(["__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"]);

export function isValidStateKey(key) {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (RESERVED_STATE_KEYS.has(trimmed)) return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed);
}

export function getDefaultStatesForCharacter() {
  return {
    mood: BUILTIN_STATES.mood.default,
    relationshipStage: BUILTIN_STATES.relationshipStage.default
  };
}

export function normalizeStateValue(type, value, key) {
  const config = BUILTIN_STATES[key];
  if (config) {
    const { min = 0, max = 100 } = config;
    if (type === "number") {
      const num = Number(value);
      if (!isNaN(num)) {
        return Math.min(max, Math.max(min, Math.round(num)));
      }
      return config.default;
    }
  }

  switch (type) {
    case "number": {
      const num = Number(value);
      return !isNaN(num) ? Math.min(100, Math.max(0, Math.round(num))) : 0;
    }
    case "boolean":
      return Boolean(value);
    case "mood":
      if (STATE_TYPES.mood.options.includes(value)) return value;
      return "neutral";
    default:
      return String(value || "");
  }
}

export function getStateType(key, customStateTypes) {
  const config = BUILTIN_STATES[key];
  if (config) return config.type;
  if (customStateTypes && customStateTypes[key]) return customStateTypes[key];
  const persisted = safeJsonParse(localStorage.getItem(CUSTOM_STATE_TYPES_KEY), {});
  if (persisted[key]) return persisted[key];
  return "string";
}

export function loadCustomStateStages() {
  return safeJsonParse(localStorage.getItem(CUSTOM_STATE_STAGES_KEY), {});
}

export function saveCustomStateStages(stages) {
  safeLocalStorageSet(CUSTOM_STATE_STAGES_KEY, JSON.stringify(stages));
}

export function loadChatMetadata() {
  return safeJsonParse(localStorage.getItem(CHAT_METADATA_KEY), {});
}

export function saveChatMetadata(metadata) {
  safeLocalStorageSet(CHAT_METADATA_KEY, JSON.stringify(metadata));
}

export function getActiveChatId(characterId) {
  return localStorage.getItem("openrouter_active_chat_id_" + characterId) || "";
}

export function setActiveChatId(characterId, chatId) {
  safeLocalStorageSet("openrouter_active_chat_id_" + characterId, chatId);
}

export function createDuoChatId(charId1, charId2) {
  return `duo_${charId1}_${charId2}_${Date.now()}`;
}

export function getDuoParticipants(chatEntry) {
  if (!chatEntry || chatEntry.type !== "duo") return null;
  return {
    primary: chatEntry.primaryCharacterId,
    secondary: chatEntry.secondaryCharacterId,
    relationship: chatEntry.duoRelationship || "strangers"
  };
}

export function isDuoChat(chatEntry) {
  return chatEntry && chatEntry.type === "duo";
}

export function getDefaultDuoStates() {
  return {
    mood: "neutral",
    duo_mood: "neutral",
    duo_relationship: "strangers"
  };
}

const PERSONAS_KEY = "openrouter_personas_v1";
const ACTIVE_PERSONA_ID_KEY = "openrouter_active_persona_id_v1";

const DEFAULT_PERSONA = {
  id: "default_persona",
  name: "Default Persona",
  userName: "User",
  userPronouns: "he/him",
  description: "A friendly individual chatting with characters."
};

export function loadPersonas() {
  const stored = safeJsonParse(localStorage.getItem(PERSONAS_KEY), null);
  if (Array.isArray(stored) && stored.length > 0) {
    return stored;
  }
  
  // Try to migrate from existing apiSettings
  let initialName = "User";
  let initialPronouns = "he/him";
  try {
    const apiSettings = safeJsonParse(localStorage.getItem(API_SETTINGS_KEY), {});
    if (apiSettings.userName) initialName = apiSettings.userName;
    if (apiSettings.userPronouns) initialPronouns = apiSettings.userPronouns;
  } catch (e) {}

  const defaultPersonas = [{
    id: "default_persona",
    name: "Default Persona",
    userName: initialName,
    userPronouns: initialPronouns,
    description: "A friendly individual chatting with characters."
  }];
  
  safeLocalStorageSet(PERSONAS_KEY, JSON.stringify(defaultPersonas));
  return defaultPersonas;
}

export function savePersonas(personas) {
  safeLocalStorageSet(PERSONAS_KEY, JSON.stringify(personas));
}

export function getActivePersonaId() {
  return localStorage.getItem(ACTIVE_PERSONA_ID_KEY) || "default_persona";
}

export function setActivePersonaId(id) {
  safeLocalStorageSet(ACTIVE_PERSONA_ID_KEY, id);
}

export function getActivePersona() {
  const personas = loadPersonas();
  const activeId = getActivePersonaId();
  return personas.find(p => p.id === activeId) || personas[0] || DEFAULT_PERSONA;
}

export function createPersonaDataFromCharacter(character) {
  if (!character) return null;

  const descParts = [];
  if (character.description) {
    descParts.push(character.description);
  }
  if (character.appearance) {
    descParts.push(`[Внешность]: ${character.appearance}`);
  }
  if (character.behavior) {
    descParts.push(`[Характер и поведение]: ${character.behavior}`);
  }
  if (character.backstory) {
    descParts.push(`[Предыстория]: ${character.backstory}`);
  }
  if (character.speech) {
    descParts.push(`[Стиль общения]: ${character.speech}`);
  }
  if (descParts.length === 0 && character.personality) {
    descParts.push(character.personality);
  }

  let pronouns = "he/him";
  if (character.gender === "she/her" || character.gender === "female") {
    pronouns = "she/her";
  } else if (character.gender === "they/them") {
    pronouns = "they/them";
  }

  const personaId = "persona_char_" + (character.id || Date.now());
  const personaName = character.name || "Персонаж";

  return {
    id: personaId,
    name: personaName,
    userName: personaName,
    userPronouns: pronouns,
    description: descParts.join("\n\n").trim(),
    avatarUrl: character.avatarUrl || ""
  };
}

const MODELS_METADATA_KEY = "openrouter_models_metadata_v1";
const MODEL_ENDPOINTS_CACHE_KEY = "openrouter_model_endpoints_cache_v1";
const TOTAL_SPENT_KEY = "openrouter_total_spent_v1";

export function loadModelsMetadataCache() {
  const cached = safeJsonParse(localStorage.getItem(MODELS_METADATA_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveModelsMetadataCache(metadata) {
  safeLocalStorageSet(MODELS_METADATA_KEY, JSON.stringify(metadata));
}

export function loadModelEndpointsCache() {
  const cached = safeJsonParse(localStorage.getItem(MODEL_ENDPOINTS_CACHE_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveModelEndpointsCache(cache) {
  safeLocalStorageSet(MODEL_ENDPOINTS_CACHE_KEY, JSON.stringify(cache));
}

export function loadTotalSpent() {
  const val = parseFloat(localStorage.getItem(TOTAL_SPENT_KEY));
  return isNaN(val) ? 0.0 : val;
}

export function saveTotalSpent(val) {
  safeLocalStorageSet(TOTAL_SPENT_KEY, String(val));
}

const LAST_PROMPT_TOKENS_KEY = "heaven_last_prompt_tokens_v1";
const LAST_COMPLETION_TOKENS_KEY = "heaven_last_completion_tokens_v1";
const LAST_COST_KEY = "heaven_last_cost_v1";

export function loadLastPromptTokens() {
  const v = localStorage.getItem(LAST_PROMPT_TOKENS_KEY);
  return v !== null && !isNaN(Number(v)) ? Number(v) : null;
}
export function saveLastPromptTokens(val) {
  if (val === null || val === undefined) localStorage.removeItem(LAST_PROMPT_TOKENS_KEY);
  else safeLocalStorageSet(LAST_PROMPT_TOKENS_KEY, String(val));
}

export function loadLastCompletionTokens() {
  const v = localStorage.getItem(LAST_COMPLETION_TOKENS_KEY);
  return v !== null && !isNaN(Number(v)) ? Number(v) : null;
}
export function saveLastCompletionTokens(val) {
  if (val === null || val === undefined) localStorage.removeItem(LAST_COMPLETION_TOKENS_KEY);
  else safeLocalStorageSet(LAST_COMPLETION_TOKENS_KEY, String(val));
}

export function loadLastCost() {
  const v = localStorage.getItem(LAST_COST_KEY);
  return v !== null && !isNaN(Number(v)) ? Number(v) : null;
}
export function saveLastCost(val) {
  if (val === null || val === undefined) localStorage.removeItem(LAST_COST_KEY);
  else safeLocalStorageSet(LAST_COST_KEY, String(val));
}

const CHAT_FONT_SIZE_KEY = "heaven_chat_font_size_v1";

export function loadChatFontSize() {
  const v = parseFloat(localStorage.getItem(CHAT_FONT_SIZE_KEY));
  return !isNaN(v) && v >= 12 && v <= 26 ? v : 15.5;
}

export function saveChatFontSize(val) {
  safeLocalStorageSet(CHAT_FONT_SIZE_KEY, String(val));
}

const DIALOGUE_COLOR_THEME_KEY = "heaven_dialogue_color_theme_v1";

export function loadDialogueColorTheme() {
  return localStorage.getItem(DIALOGUE_COLOR_THEME_KEY) || "white";
}

export function saveDialogueColorTheme(val) {
  safeLocalStorageSet(DIALOGUE_COLOR_THEME_KEY, String(val));
}

const READER_SETTINGS_KEY = "heaven_reader_settings_v1";

export function loadReaderSettings() {
  const cached = safeJsonParse(localStorage.getItem(READER_SETTINGS_KEY), null);
  if (cached && typeof cached === "object") {
    return {
      fontSize: typeof cached.fontSize === "number" ? cached.fontSize : 15.5,
      lineHeight: typeof cached.lineHeight === "number" ? cached.lineHeight : 1.74,
      maxWidth: typeof cached.maxWidth === "string" ? cached.maxWidth : "860px"
    };
  }
  return {
    fontSize: loadChatFontSize(),
    lineHeight: 1.74,
    maxWidth: "860px"
  };
}

export function saveReaderSettings(settings) {
  safeLocalStorageSet(READER_SETTINGS_KEY, JSON.stringify(settings));
}

const CHAT_SUMMARIES_KEY = "openrouter_chat_summaries_v1";
const CHAT_SUMMARIZED_COUNT_KEY = "openrouter_chat_summarized_count_v1";

export function loadChatSummaries() {
  const cached = safeJsonParse(localStorage.getItem(CHAT_SUMMARIES_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveChatSummaries(summaries) {
  safeLocalStorageSet(CHAT_SUMMARIES_KEY, JSON.stringify(summaries));
}

export function loadChatSummarizedMessageCount() {
  const cached = safeJsonParse(localStorage.getItem(CHAT_SUMMARIZED_COUNT_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveChatSummarizedMessageCount(counts) {
  safeLocalStorageSet(CHAT_SUMMARIZED_COUNT_KEY, JSON.stringify(counts));
}

const CHAT_SUMMARY_SNAPSHOTS_KEY = "openrouter_chat_summary_snapshots_v1";

export function loadChatSummarySnapshots() {
  const cached = safeJsonParse(localStorage.getItem(CHAT_SUMMARY_SNAPSHOTS_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveChatSummarySnapshots(snapshots) {
  safeLocalStorageSet(CHAT_SUMMARY_SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

const PINNED_FACTS_KEY = "openrouter_pinned_facts_v1";

export function loadPinnedFacts() {
  const cached = safeJsonParse(localStorage.getItem(PINNED_FACTS_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function savePinnedFacts(facts) {
  safeLocalStorageSet(PINNED_FACTS_KEY, JSON.stringify(facts));
}

const GM_SCENES_KEY = "openrouter_gm_scenes_v1";
const ACTIVE_GM_SCENE_ID_KEY = "openrouter_active_gm_scene_id_v1";
const GM_CHATS_KEY = "openrouter_gm_chats_v1";
const SIDEBAR_TAB_KEY = "openrouter_sidebar_tab_v1";

export function loadGmScenes() {
  return safeJsonParse(localStorage.getItem(GM_SCENES_KEY), []);
}

export function saveGmScenes(scenes) {
  safeLocalStorageSet(GM_SCENES_KEY, JSON.stringify(scenes));
}

export function loadActiveGmSceneId() {
  return localStorage.getItem(ACTIVE_GM_SCENE_ID_KEY) || "";
}

export function saveActiveGmSceneId(id) {
  safeLocalStorageSet(ACTIVE_GM_SCENE_ID_KEY, id || "");
}

export function loadGmChats() {
  return safeJsonParse(localStorage.getItem(GM_CHATS_KEY), {});
}

export function saveGmChats(chats) {
  safeLocalStorageSet(GM_CHATS_KEY, JSON.stringify(chats));
}

const CHARACTER_DIRECTIVES_KEY = "openrouter_character_directives_v1";

export function loadCharacterDirectives() {
  const cached = safeJsonParse(localStorage.getItem(CHARACTER_DIRECTIVES_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveCharacterDirectives(directives) {
  safeLocalStorageSet(CHARACTER_DIRECTIVES_KEY, JSON.stringify(directives));
}

export function loadSidebarTab() {
  return localStorage.getItem(SIDEBAR_TAB_KEY) || "characters";
}

export function saveSidebarTab(tab) {
  safeLocalStorageSet(SIDEBAR_TAB_KEY, tab);
}

const SESSION_MEMORIES_KEY = "openrouter_session_memories_v1";

export function loadSessionMemories() {
  const cached = safeJsonParse(localStorage.getItem(SESSION_MEMORIES_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveSessionMemories(memories) {
  safeLocalStorageSet(SESSION_MEMORIES_KEY, JSON.stringify(memories));
}

export function getSessionMemory(chatId) {
  if (!chatId) return null;
  const all = loadSessionMemories();
  return all[chatId] || null;
}

export function saveSessionMemory(chatId, memory) {
  if (!chatId) return;
  const all = loadSessionMemories();
  all[chatId] = memory;
  saveSessionMemories(all);
}

const SESSION_MEMORY_SNAPSHOTS_KEY = "openrouter_session_memory_snapshots_v1";

export function loadSessionMemorySnapshots() {
  const cached = safeJsonParse(localStorage.getItem(SESSION_MEMORY_SNAPSHOTS_KEY), {});
  return cached && typeof cached === "object" ? cached : {};
}

export function saveSessionMemorySnapshots(snapshots) {
  safeLocalStorageSet(SESSION_MEMORY_SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export function exportAllStorageData() {
  const data = {};
  if (typeof localStorage === "undefined") return data;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const raw = localStorage.getItem(key);
      try {
        data[key] = JSON.parse(raw);
      } catch (_e) {
        data[key] = raw;
      }
    }
  }
  return data;
}

export function clearAllStorageData() {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
}



