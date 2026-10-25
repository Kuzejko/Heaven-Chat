import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const storageMap = new Map();
if (typeof global.localStorage === "undefined" || !global.localStorage) {
  global.localStorage = {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear(),
    get length() { return storageMap.size; },
    key: (i) => Array.from(storageMap.keys())[i] || null
  };
}
if (typeof global.window === "undefined") {
  global.window = {};
}

// Mock DOM elements for UI & Config tests
const domElements = {};
function createMockElement(id, tag = "div") {
  return {
    id,
    tagName: tag.toUpperCase(),
    value: "",
    checked: false,
    textContent: "",
    innerHTML: "",
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    addEventListener: () => {},
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: () => {},
    open: false,
    showModal: function() { this.open = true; },
    close: function() { this.open = false; }
  };
}

const mockIds = [
  "saveSettingsBtn", "closeSettingsBtn", "manageCharactersBtn", "settingsDialog",
  "apiProviderSelect", "apiKeyInput", "nordrouterApiKeyInput", "nordrouterBaseUrlInput",
  "localBaseUrlInput", "localApiKeyInput", "modelSelect", "customModelInput",
  "evaluatorModelSelect", "customEvaluatorModelInput", "translationModelSelect",
  "customTranslationModelInput", "jevModelSelect", "customJevModelInput", "jevActiveModelName",
  "temperatureInput", "repetitionPenaltyInput", "presencePenaltyInput", "frequencyPenaltyInput",
  "topPInput", "minPInput", "maxTokensInput", "thinkingDisplaySelect", "enableInnerMonologueInput",
  "enableEvaluatorInput", "stabsEdhToggle", "enableHiddenTraitsToggle", "userNameInput",
  "userPronounsSelect", "responseLengthSelect", "chatLanguageSelect", "worldGenreSelect",
  "summaryModeSelect", "initiativeLevelSelect", "maxHistoryMessagesSelect", "providerSortSelect",
  "specificProviderSelect", "specificProviderInput", "allowFallbacksInput", "globalSystemPromptInput",
  "thinkingToggleBtn", "activeModelBadge", "settingsModelDetails"
];

for (const id of mockIds) {
  domElements[id] = createMockElement(id);
}

if (typeof global.document === "undefined") {
  global.document = {
    getElementById: (id) => domElements[id] || createMockElement(id),
    createElement: (tag) => createMockElement("mock-" + tag, tag),
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const { state } = await import("../js/state.js");
const { dom } = await import("../js/ui.js");
const {
  syncApiSettingsFromInputs,
  renderModelOptions,
  saveSettingsFromDialog
} = await import("../js/config.js");
const {
  loadApiSettings,
  loadApiKey,
  saveApiKey,
  loadGlobalSystemPrompt
} = await import("../services/storage.js");

console.log("=== Running Settings Persistence & UI Tests ===");

// 1. Verify index.html contains saveSettingsBtn and closeSettingsBtn inside settings-dialog-footer
{
  const html = fs.readFileSync(path.resolve("index.html"), "utf-8");
  assert.ok(html.includes('id="saveSettingsBtn"'), "index.html must contain id='saveSettingsBtn'");
  assert.ok(html.includes('id="closeSettingsBtn"'), "index.html must contain id='closeSettingsBtn'");
  assert.ok(html.includes('class="dialog-footer-section settings-dialog-footer"'), "settings dialog must have settings-dialog-footer class");
  assert.ok(html.includes("Сохранить настройки"), "save button must have friendly Russian label");
  console.log("✔ Test 1 passed: index.html markup correctly defines saveSettingsBtn and closeSettingsBtn.");
}

// 2. Verify styles.css contains styles for settings-dialog-footer and btn-save-settings
{
  const css = fs.readFileSync(path.resolve("styles.css"), "utf-8");
  assert.ok(css.includes(".settings-dialog-footer"), "styles.css must style .settings-dialog-footer");
  assert.ok(css.includes(".btn-save-settings"), "styles.css must style .btn-save-settings");
  console.log("✔ Test 2 passed: styles.css contains custom styling for the footer and save button.");
}

// 3. Verify js/ui.js binds saveSettingsBtn and closeSettingsBtn
{
  assert.ok(dom.saveSettingsBtn, "dom.saveSettingsBtn must be bound");
  assert.ok(dom.closeSettingsBtn, "dom.closeSettingsBtn must be bound");
  console.log("✔ Test 3 passed: dom object exports saveSettingsBtn and closeSettingsBtn.");
}

// 4. Verify syncApiSettingsFromInputs persists all settings, api key, and global system prompt
{
  storageMap.clear();
  dom.temperatureInput.value = "1.15";
  dom.maxTokensInput.value = "2500";
  dom.presencePenaltyInput.value = "0.45";
  dom.frequencyPenaltyInput.value = "0.35";
  dom.userNameInput.value = "Commander Shepard";
  dom.apiKeyInput.value = "sk-test-openrouter-key-123";
  dom.globalSystemPromptInput.value = "Always respond in epic cinematic style.";
  dom.initiativeLevelSelect.value = "high";

  syncApiSettingsFromInputs();

  const savedSettings = loadApiSettings();
  assert.strictEqual(savedSettings.temperature, 1.15, "Temperature must be saved as 1.15");
  assert.strictEqual(savedSettings.maxTokens, 2500, "MaxTokens must be saved as 2500");
  assert.strictEqual(savedSettings.presencePenalty, 0.45, "Presence penalty must be saved as 0.45");
  assert.strictEqual(savedSettings.frequencyPenalty, 0.35, "Frequency penalty must be saved as 0.35");
  assert.strictEqual(savedSettings.userName, "Commander Shepard", "User name must be saved");
  assert.strictEqual(savedSettings.initiativeLevel, "high", "Initiative level must be saved as high");

  assert.strictEqual(loadApiKey(), "sk-test-openrouter-key-123", "API Key must be persisted to storage");
  assert.strictEqual(loadGlobalSystemPrompt(), "Always respond in epic cinematic style.", "Global prompt must be persisted");

  console.log("✔ Test 4 passed: syncApiSettingsFromInputs accurately writes all parameters to storage.");
}

// 5. Verify saveSettingsFromDialog saves data, displays feedback, and closes modal
{
  dom.settingsDialog.open = true;
  dom.temperatureInput.value = "0.75";
  dom.userNameInput.value = "Geralt";

  saveSettingsFromDialog({ showNotification: false, closeDialog: true });

  assert.strictEqual(dom.settingsDialog.open, false, "Dialog must be closed after saveSettingsFromDialog");
  const reloaded = loadApiSettings();
  assert.strictEqual(reloaded.temperature, 0.75, "Temperature must be saved");
  assert.strictEqual(reloaded.userName, "Geralt", "UserName must be saved");

  console.log("✔ Test 5 passed: saveSettingsFromDialog synchronizes inputs and closes dialog.");
}

// 6. Verify renderModelOptions populates DOM inputs from current state
{
  state.apiSettings.temperature = 0.88;
  state.apiSettings.userName = "Neo";
  state.globalSystemPrompt = "Wake up, Neo.";
  saveApiKey("sk-matrix-key");

  renderModelOptions();

  assert.strictEqual(dom.temperatureInput.value, "0.88", "renderModelOptions must set temperature input");
  assert.strictEqual(dom.userNameInput.value, "Neo", "renderModelOptions must set userName input");
  assert.strictEqual(dom.globalSystemPromptInput.value, "Wake up, Neo.", "renderModelOptions must set global system prompt");
  assert.strictEqual(dom.apiKeyInput.value, "sk-matrix-key", "renderModelOptions must set apiKey input");

  console.log("✔ Test 6 passed: renderModelOptions accurately initializes inputs from current application state.");
}

console.log("\n🚀 All Settings Persistence & UI Tests Passed Successfully!");
