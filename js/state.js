import { 
  loadChatMetadata, 
  loadCustomStateTypes, 
  loadCustomStateStages, 
  getActiveChatId,
  saveChatStates,
  getStateType,
  normalizeStateValue,
  BUILTIN_STATES,
  loadModelsMetadataCache,
  loadModelEndpointsCache,
  loadTotalSpent,
  loadChatSummaries,
  loadChatSummarizedMessageCount,
  loadChatSummarySnapshots,
  loadGmScenes,
  loadActiveGmSceneId,
  loadGmChats,
  loadSidebarTab,
  loadCharacterDirectives,
  loadSessionMemories,
  loadLastPromptTokens,
  loadLastCompletionTokens,
  loadLastCost
} from "../services/storage.js";

// Global History Limit for undo/redo stack
const HISTORY_LIMIT = 20;

export const state = {
  characters: [],
  chats: {},
  globalSystemPrompt: "",
  chatStates: {},
  chatMetadata: loadChatMetadata(),
  characterDirectives: loadCharacterDirectives(),
  customStateTypes: loadCustomStateTypes(), // Registry: {key: "number"|"string"|"boolean"}
  customStateStages: loadCustomStateStages(), // Registry: { characterId: { key: [stage1, ..., stage6] } }
  generatingStages: {}, // Registry: { characterId_stateKey: true }
  pendingStateProposals: {},
  apiLogs: [],
  jevLogs: [],
  activeDebugFilter: "all",
  apiSettings: {},
  models: [],
  modelsMetadata: loadModelsMetadataCache(),
  modelEndpointsCache: loadModelEndpointsCache(),
  totalSpent: loadTotalSpent(),
  lastPromptTokens: loadLastPromptTokens(),
  lastCompletionTokens: loadLastCompletionTokens(),
  lastCost: loadLastCost(),
  chatSummaries: loadChatSummaries(),
  sessionMemories: loadSessionMemories(),
  chatSummarizedMessageCount: loadChatSummarizedMessageCount(),
  chatSummarySnapshots: loadChatSummarySnapshots(),
  gmScenes: loadGmScenes(),
  activeGmSceneId: loadActiveGmSceneId(),
  gmChats: loadGmChats(),
  sidebarTab: loadSidebarTab(),
  activeCharacterId: "",
  selectedMessageIndex: null,
  isStreaming: false,
  abortController: null,
  historyStack: [],
  redoStack: [],
  charQuery: "",
  replyingToMessageIndex: null,
  wizardMessages: [],
  promptWizardMessages: [],
  pendingAttachedImages: []
};

// Callback registry for UI updates on state changes
let stateChangeCallback = null;
let traitModifierCallback = null;

export function onStateChange(callback) {
  stateChangeCallback = callback;
}

export function onTraitModifier(callback) {
  traitModifierCallback = callback;
}

function notifyChange(actionName, statusMessage) {
  if (stateChangeCallback) {
    stateChangeCallback({ action: actionName, message: statusMessage });
  }
}

export function getChatStates(targetId) {
  if (targetId && (String(targetId).startsWith("chat_") || String(targetId).startsWith("duo_"))) {
    return state.chatStates[targetId] || {};
  }
  const chatId = getActiveChatId(targetId);
  if (chatId) {
    return state.chatStates[chatId] || {};
  }
  return {};
}

export function pushAction(action, data, inverse) {
  state.historyStack.push({ action, data, inverse });
  state.redoStack = [];
  if (state.historyStack.length > HISTORY_LIMIT) {
    state.historyStack.shift();
  }
}

export function undo() {
  const last = state.historyStack.pop();
  if (!last) {
    notifyChange("undo_empty", "Nothing to undo.");
    return;
  }

  const { action, data } = last;
  const charId = data.characterId;

  if (action === "state_add") {
    if (data.oldValue === undefined) {
      const nextChatState = { ...getChatStates(charId) };
      delete nextChatState[data.key];
      state.chatStates = { ...state.chatStates, [charId]: nextChatState };
    } else {
      state.chatStates = {
        ...state.chatStates,
        [charId]: { ...getChatStates(charId), [data.key]: data.oldValue }
      };
    }
    saveChatStates(state.chatStates);
    notifyChange("state_reverted", `Undo: reverted state "${data.key}".`);
  } else if (action === "state_delete") {
    state.chatStates = {
      ...state.chatStates,
      [charId]: { ...getChatStates(charId), [data.key]: data.value }
    };
    saveChatStates(state.chatStates);
    notifyChange("state_restored", `Undo: restored state "${data.key}".`);
  } else if (action === "proposal_apply") {
    // Restore proposal to list
    const current = [...(state.pendingStateProposals[charId] || [])];
    current.push(data.proposal);
    state.pendingStateProposals[charId] = current;
    
    // Revert state change
    if (data.oldValue === undefined) {
      const nextChatState = { ...getChatStates(charId) };
      delete nextChatState[data.proposal.key];
      state.chatStates = { ...state.chatStates, [charId]: nextChatState };
    } else {
      state.chatStates = {
        ...state.chatStates,
        [charId]: { ...getChatStates(charId), [data.proposal.key]: data.oldValue }
      };
    }
    saveChatStates(state.chatStates);
    notifyChange("proposal_reverted", "Undo: restored proposal and reverted state.");
  } else if (action === "proposal_dismiss") {
    // Restore dismissed proposal to list
    const current = [...(state.pendingStateProposals[charId] || [])];
    current.push(data.proposal);
    state.pendingStateProposals[charId] = current;
    notifyChange("proposal_restored", "Undo: restored dismissed proposal.");
  }

  state.redoStack.push(last);
}

export function redo() {
  const nextAction = state.redoStack.pop();
  if (!nextAction) {
    notifyChange("redo_empty", "Nothing to redo.");
    return;
  }

  const { action, data } = nextAction;
  const charId = data.characterId;

  if (action === "state_add") {
    state.chatStates = {
      ...state.chatStates,
      [charId]: { ...getChatStates(charId), [data.key]: data.value }
    };
    saveChatStates(state.chatStates);
    notifyChange("state_applied", `Redo: applied state "${data.key}".`);
  } else if (action === "state_delete") {
    // Resolved shadowing: renamed 'next' to 'nextChatState'
    const nextChatState = { ...getChatStates(charId) };
    delete nextChatState[data.key];
    state.chatStates = { ...state.chatStates, [charId]: nextChatState };
    saveChatStates(state.chatStates);
    notifyChange("state_deleted", `Redo: removed state "${data.key}".`);
  } else if (action === "proposal_apply") {
    // Remove proposal from list
    const current = [...(state.pendingStateProposals[charId] || [])];
    const targetIdx = current.findIndex(p => p.key === data.proposal.key);
    if (targetIdx !== -1) current.splice(targetIdx, 1);
    state.pendingStateProposals[charId] = current;
    
    // Re-apply state change with trait modifiers
    const type = getStateType(data.proposal.key, state.customStateTypes);
    let applyValue = data.proposal.value;
    
    if (type === "number" && traitModifierCallback) {
      const character = state.characters.find(c => {
        const chatId = getActiveChatId(c.id);
        return chatId === charId || c.id === charId;
      });
      if (character) {
        const modified = traitModifierCallback(character, data.proposal.key, data.proposal.value);
        if (modified && typeof modified.value === "number") {
          applyValue = modified.value;
        }
      }
    }
    
    const orig = typeof data.oldValue === "number" ? data.oldValue : (BUILTIN_STATES[data.proposal.key]?.default ?? 0);
    const newValue = type === "number" ? orig + applyValue : applyValue;
    const normalized = normalizeStateValue(type, newValue, data.proposal.key);
    
    state.chatStates = {
      ...state.chatStates,
      [charId]: { ...getChatStates(charId), [data.proposal.key]: normalized }
    };
    saveChatStates(state.chatStates);
    notifyChange("proposal_applied", "Redo: applied proposal.");
  } else if (action === "proposal_dismiss") {
    // Remove (dismiss) proposal from list again
    const current = [...(state.pendingStateProposals[charId] || [])];
    const targetIdx = current.findIndex(p => p.key === data.proposal.key);
    if (targetIdx !== -1) current.splice(targetIdx, 1);
    state.pendingStateProposals[charId] = current;
    notifyChange("proposal_dismissed", "Redo: dismissed proposal.");
  }

  state.historyStack.push(nextAction);
}
