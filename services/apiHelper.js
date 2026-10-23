import { loadApiKey, loadNordrouterApiKey } from "./storage.js";
import { state } from "../js/state.js";

/**
 * Returns the effective API configuration based on the current settings and DOM inputs.
 * Resolves Issue 14 (duplicate API configuration logic).
 * 
 * @param {Object} apiSettings - The normalized API settings from the state.
 * @param {string} domApiKeyInputVal - Current value of the API key input in the DOM.
 * @returns {Object} The consolidated API configuration.
 */
export function getEffectiveApiConfig(apiSettings, domApiKeyInputVal) {
  const isLocal = apiSettings.apiProvider === "local";
  const isKobold = apiSettings.apiProvider === "kobold";
  const isNordrouter = apiSettings.apiProvider === "nordrouter";
  
  // 1. Resolve API Key
  let apiKey = "";
  if (isLocal) {
    apiKey = apiSettings.localApiKey || "lm-studio";
  } else if (isKobold) {
    apiKey = "";
  } else if (isNordrouter) {
    apiKey = apiSettings.nordrouterApiKey || loadNordrouterApiKey() || "";
  } else {
    // If input is provided, use it, otherwise fall back to loadApiKey()
    apiKey = (domApiKeyInputVal && domApiKeyInputVal.trim()) ? domApiKeyInputVal.trim() : loadApiKey();
  }

  // 2. Resolve Base URL
  let baseUrl = null;
  if (isLocal) {
    baseUrl = apiSettings.localBaseUrl || "http://localhost:1234/v1";
  } else if (isKobold) {
    baseUrl = apiSettings.localBaseUrl || "http://localhost:5001";
  } else if (isNordrouter) {
    baseUrl = (apiSettings.nordrouterBaseUrl || "https://nordrouter.com/v1").trim().replace(/\/+$/, "");
  }

  // 3. Resolve Model
  const model = apiSettings.selectedModel || "openai/gpt-4o-mini";

  return {
    apiKey,
    baseUrl,
    model,
    apiProvider: apiSettings.apiProvider || "openrouter",
    temperature: typeof apiSettings.temperature !== 'undefined' ? Number(apiSettings.temperature) : 0.68,
    repetitionPenalty: typeof apiSettings.repetitionPenalty !== 'undefined' ? Number(apiSettings.repetitionPenalty) : 1.05,
    presencePenalty: typeof apiSettings.presencePenalty !== 'undefined' ? Number(apiSettings.presencePenalty) : 0.15,
    frequencyPenalty: typeof apiSettings.frequencyPenalty !== 'undefined' ? Number(apiSettings.frequencyPenalty) : 0.15,
    topP: typeof apiSettings.topP !== 'undefined' ? Number(apiSettings.topP) : 0.95,
    minP: typeof apiSettings.minP !== 'undefined' ? Number(apiSettings.minP) : 0.05,
    enableThinking: apiSettings.enableInnerMonologue !== false
  };
}
