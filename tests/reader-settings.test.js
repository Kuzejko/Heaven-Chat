import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Setup in-memory localStorage mock before any app imports
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] || null
};
global.window = {};

const mockElements = {};
function createMockEl(id = "", tag = "div") {
  return {
    id,
    tagName: tag.toUpperCase(),
    value: "",
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    addEventListener: () => {},
    querySelector: () => createMockEl("sub"),
    querySelectorAll: () => []
  };
}

global.document = {
  documentElement: {
    style: {
      setProperty: (k, v) => {},
      getPropertyValue: (k) => ""
    }
  },
  getElementById: (id) => mockElements[id] || (mockElements[id] = createMockEl(id)),
  querySelector: () => createMockEl("q"),
  querySelectorAll: () => []
};

// 1. Dynamic import of storage
const { loadReaderSettings, saveReaderSettings } = await import("../services/storage.js");

console.log("--- 1. Testing loadReaderSettings & saveReaderSettings ---");
const defaultSettings = loadReaderSettings();
assert.strictEqual(typeof defaultSettings.fontSize, "number");
assert.strictEqual(typeof defaultSettings.lineHeight, "number");
assert.strictEqual(typeof defaultSettings.maxWidth, "string");
assert.strictEqual(defaultSettings.fontSize, 15.5);
assert.strictEqual(defaultSettings.lineHeight, 1.74);
assert.strictEqual(defaultSettings.maxWidth, "860px");

// Save customized settings
saveReaderSettings({ fontSize: 18, lineHeight: 1.9, maxWidth: "740px" });
const loaded = loadReaderSettings();
assert.strictEqual(loaded.fontSize, 18);
assert.strictEqual(loaded.lineHeight, 1.9);
assert.strictEqual(loaded.maxWidth, "740px");
console.log("✔ Storage reader settings persistence: PASSED");

// 2. Dynamic import of formatMessageContent
const { formatMessageContent } = await import("../js/ui.js");

console.log("--- 2. Testing formatMessageContent ---");

// Test dialogue quotes
const rawSpeech = "«Привет, путешественник!» — сказала она.";
const formattedSpeech = formatMessageContent(rawSpeech);
assert.ok(formattedSpeech.includes("class='dialogue'") || formattedSpeech.includes("class=\"dialogue\""), "Dialogue quotes must be wrapped in .dialogue");
console.log("✔ Russian dialogue quotes highlight: PASSED");

// Test actions
const rawAction = "*Она тихо вздохнула.*";
const formattedAction = formatMessageContent(rawAction);
assert.ok(formattedAction.includes("action") || formattedAction.includes("<em>"), "Actions must be formatted with action class or em");
console.log("✔ Actions highlight: PASSED");

// Test thoughts
const rawThought = "~Неужели он догадался?~";
const formattedThought = formatMessageContent(rawThought);
assert.ok(formattedThought.includes("thought"), "Thoughts ~text~ must be wrapped in .thought");
console.log("✔ Thoughts ~thought~ highlight: PASSED");

// Test that conversational tilde at end of word is not mangled into broken thought tag
const rawConversational = "Привет~ Как твои дела?";
const formattedConversational = formatMessageContent(rawConversational);
assert.ok(!formattedConversational.includes("class='thought'"), "Trailing conversational tilde should not trigger thought tag");
console.log("✔ Conversational tilde safety: PASSED");

// 3. Test index.html Markup for Phase 1 elements
console.log("--- 3. Testing index.html elements ---");
const htmlPath = path.resolve(__dirname, "../index.html");
const html = fs.readFileSync(htmlPath, "utf-8");

assert.ok(html.includes("id=\"readerSettingsBtn\""), "index.html must have #readerSettingsBtn");
assert.ok(html.includes("id=\"readerSettingsPopover\""), "index.html must have #readerSettingsPopover");
assert.ok(html.includes("id=\"headerStateBadge\""), "index.html must have #headerStateBadge");
assert.ok(html.includes("id=\"chatScrollBottomBtn\""), "index.html must have #chatScrollBottomBtn");
console.log("✔ index.html element verification: PASSED");

// 4. Test styles.css for CSS classes
console.log("--- 4. Testing styles.css classes ---");
const cssPath = path.resolve(__dirname, "../styles.css");
const css = fs.readFileSync(cssPath, "utf-8");

assert.ok(css.includes(".reader-settings-popover"), "styles.css must style .reader-settings-popover");
assert.ok(css.includes(".chat-scroll-bottom-btn"), "styles.css must style .chat-scroll-bottom-btn");
assert.ok(css.includes(".header-state-badge"), "styles.css must style .header-state-badge");
assert.ok(css.includes(".thought"), "styles.css must style .thought");
assert.ok(css.includes("--chat-font-size"), "styles.css must define --chat-font-size");
assert.ok(css.includes("--chat-line-height"), "styles.css must define --chat-line-height");
assert.ok(css.includes("--chat-max-width"), "styles.css must define --chat-max-width");
console.log("✔ styles.css rules verification: PASSED");

console.log("\n🎉 ALL READER SETTINGS TESTS PASSED SUCCESSFULLY! 🎉");
