import assert from "node:assert";

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
if (typeof global.document === "undefined") {
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const { getResponseLengthDirective, buildApiMessages } = await import("../services/promptBuilder.js");
const { state } = await import("../js/state.js");

console.log("=== Running Response Length Directive Tests ===");

// 1. All levels return localized RU directives
{
  assert.ok(getResponseLengthDirective("short", true).includes("КРАТКИЙ"), "short RU");
  assert.ok(getResponseLengthDirective("short", true).includes("1-3 предложения"), "short RU scale");
  assert.ok(getResponseLengthDirective("medium", true).includes("СРЕДНИЙ"), "medium RU");
  assert.ok(getResponseLengthDirective("long", true).includes("4-5 абзацев"), "long RU scale");
  assert.ok(getResponseLengthDirective("huge", true).includes("6+ абзацев"), "huge RU scale");
  assert.ok(getResponseLengthDirective("adaptive", true).includes("АДАПТИВНАЯ"), "adaptive RU");
  console.log("✔ Test 1 passed: All levels return proper RU directives.");
}

// 2. All levels return localized EN directives
{
  assert.ok(getResponseLengthDirective("short", false).includes("SHORT"), "short EN");
  assert.ok(getResponseLengthDirective("medium", false).includes("MEDIUM"), "medium EN");
  assert.ok(getResponseLengthDirective("long", false).includes("4-5 paragraphs"), "long EN scale");
  assert.ok(getResponseLengthDirective("huge", false).includes("6+ paragraphs"), "huge EN scale");
  assert.ok(getResponseLengthDirective("adaptive", false).includes("ADAPTIVE"), "adaptive EN");
  console.log("✔ Test 2 passed: All levels return proper EN directives.");
}

// 3. Unknown/garbage values fall back to medium
{
  const fallback = getResponseLengthDirective("banana", true);
  assert.ok(fallback.includes("СРЕДНИЙ"), "Unknown value must fall back to medium");
  const empty = getResponseLengthDirective(undefined, false);
  assert.ok(empty.includes("MEDIUM"), "Undefined must fall back to medium");
  console.log("✔ Test 3 passed: Unknown and missing values fall back to medium.");
}

// 4. Solo branch injects the unified localized directive + finish-sentence rule
{
  const dummyChar = {
    id: "test-char-len",
    name: "Олег",
    gender: "he/him",
    description: "Тестовый персонаж"
  };
  state.activeCharacterId = dummyChar.id;
  state.sidebarTab = "characters";
  state.characters = [dummyChar];
  state.chats = { [dummyChar.id]: [] };
  state.chatMetadata = { [dummyChar.id]: { type: "single" } };
  state.apiSettings = { chatLanguage: "ru", responseLength: "long", stabsEdhEnabled: true };

  const msgs = buildApiMessages(dummyChar, "Привет", null, null, null, dummyChar.id);
  const reminder = msgs[msgs.length - 1].content;
  assert.ok(reminder.includes("Длина ответа: ПОДРОБНЫЙ — 4-5 абзацев"), "Solo must inject unified RU directive");
  assert.ok(reminder.includes("дописывай последнее предложение до конца"), "Solo must include the finish-sentence rule");
  assert.ok(!reminder.includes("write a LONG response"), "Solo must NOT contain the old English-only text in RU chats");
  console.log("✔ Test 4 passed: Solo branch uses unified localized directive and finish-sentence rule.");
}

// 5. Solo and GM inject the SAME directive for the same setting (consistency)
{
  state.apiSettings = { chatLanguage: "ru", responseLength: "huge", stabsEdhEnabled: true };

  const soloMsgs = buildApiMessages(state.characters[0], "Привет", null, null, null, "test-char-len");
  const soloReminder = soloMsgs[soloMsgs.length - 1].content;

  state.sidebarTab = "gm";
  state.activeGmSceneId = "scene_len_test";
  state.gmScenes = [{ id: "scene_len_test", name: "Тест", scenario: "Таверна", participants: [], npcs: [] }];
  state.chats = { scene_len_test: [] };
  state.chatMetadata = { scene_len_test: [] };

  const gmMsgs = buildApiMessages(null, "Привет", null, null, null, "scene_len_test");
  const gmReminder = gmMsgs[gmMsgs.length - 1].content;

  const expected = "Длина ответа: МАКСИМАЛЬНО ПОДРОБНЫЙ — 6+ абзацев";
  assert.ok(soloReminder.includes(expected), "Solo must contain the unified huge directive");
  assert.ok(gmReminder.includes(expected), "GM must contain the SAME unified huge directive");
  console.log("✔ Test 5 passed: Solo and GM are consistent for the same responseLength setting.");
}

// 6. Adaptive mode injects adaptive directive in both branches
{
  state.apiSettings = { chatLanguage: "ru", responseLength: "adaptive", stabsEdhEnabled: true };

  state.sidebarTab = "characters";
  const soloMsgs = buildApiMessages(state.characters[0], "Привет", null, null, null, "test-char-len");
  assert.ok(soloMsgs[soloMsgs.length - 1].content.includes("АДАПТИВНАЯ"), "Solo adaptive");

  state.sidebarTab = "gm";
  const gmMsgs = buildApiMessages(null, "Привет", null, null, null, "scene_len_test");
  assert.ok(gmMsgs[gmMsgs.length - 1].content.includes("АДАПТИВНАЯ"), "GM adaptive");
  console.log("✔ Test 6 passed: Adaptive mode works in both Solo and GM.");
}

console.log("\n🚀 All Response Length Directive Tests Passed Successfully!\n");
