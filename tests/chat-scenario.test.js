import assert from "assert";

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

const { buildSystemContext } = await import("../services/promptBuilder.js");
const { state } = await import("../js/state.js");

console.log("=== Running Chat Scenario Override Tests ===");

const character = {
  id: "char_scenario_test",
  name: "Элея",
  gender: "she/her",
  personality: "Мудрая эльфийка",
  scenario: "Характерный сценарий персонажа"
};
const chatId = "chat_scenario_test";

{
  state.chatMetadata = { [chatId]: {} };
  const ctx = buildSystemContext(character, "", null, null, null, chatId, []);
  assert.ok(ctx.includes("Характерный сценарий персонажа"), "Without override the character scenario is used");
  console.log("✔ Test 1 passed: character scenario is used when no chat override is set.");
}

{
  state.chatMetadata = { [chatId]: { customScenario: "Ночной рынок, торговцы закрывают лавки." } };
  const ctx = buildSystemContext(character, "", null, null, null, chatId, []);
  assert.ok(ctx.includes("Ночной рынок, торговцы закрывают лавки."), "Chat override must be in the prompt");
  assert.ok(!ctx.includes("Характерный сценарий персонажа"), "Chat override must replace the character scenario");
  console.log("✔ Test 2 passed: chat custom scenario replaces the character scenario.");
}

{
  state.chatMetadata = { [chatId]: { customScenario: "Ночной рынок." } };
  const ctx = buildSystemContext(character, "", null, null, "Сценарий дуэта", chatId, []);
  assert.ok(ctx.includes("Сценарий дуэта"), "Shared (duo) scenario must keep priority");
  assert.ok(!ctx.includes("Ночной рынок."), "Chat override must not apply to shared duo scenario");
  console.log("✔ Test 3 passed: shared duo scenario keeps priority over chat override.");
}

{
  state.chatMetadata = { [chatId]: { customScenario: "Сцена с {{char}} в таверне." } };
  const ctx = buildSystemContext(character, "", null, null, null, chatId, []);
  assert.ok(ctx.includes("Сцена с Элея в таверне."), "Macros in chat scenario must be replaced");
  console.log("✔ Test 4 passed: macros in chat scenario are expanded.");
}

console.log("\n🚀 All Chat Scenario Override Tests Passed Successfully!\n");
