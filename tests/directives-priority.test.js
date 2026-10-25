import assert from "assert";

// Mock localStorage if in node environment
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

// Mock document/window
if (typeof global.document === "undefined") {
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      appendChild: () => {},
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} },
      style: {}
    })
  };
}

const { state } = await import("../js/state.js");
const { buildSystemContext, buildApiMessages, buildGroupScenePrompt } = await import("../services/promptBuilder.js");
const { toggleDirectivePriority } = await import("../js/ui.js");

console.log("=== Running Directives Hard Priority Tests ===");

const testChatId = "chat_test_directives_priority_1";
state.activeCharacterId = "char_dp_1";
state.sidebarTab = "characters";
state.apiSettings = { chatLanguage: "ru" };

const mockCharacter = {
  id: "char_dp_1",
  name: "Алиса",
  personality: "Остроумная и энергичная",
  description: "Детектив",
  first_message: "Привет!"
};

// 1. Test: Single normal directive produces <core_directives> without hard block
state.characterDirectives = {
  [testChatId]: [
    { id: "dir_1", text: "Любит пить зеленый чай", active: true, priority: "normal" }
  ]
};

let sysContext = buildSystemContext(mockCharacter, "Привет", null, null, {}, testChatId);
assert.ok(sysContext.includes("<core_directives>"), "Must contain core_directives for normal directive");
assert.ok(!sysContext.includes("<hard_priority_directives>"), "Must NOT contain hard_priority_directives when only normal");
console.log("✔ Test 1 passed: Normal directive produces standard core_directives.");

// 2. Test: Hard priority directive produces <hard_priority_directives> with aggressive push instruction
state.characterDirectives = {
  [testChatId]: [
    { id: "dir_1", text: "Любит пить зеленый чай", active: true, priority: "normal" },
    { id: "dir_2", text: "Немедленно признаться в тайных чувствах", active: true, priority: "hard" }
  ]
};

sysContext = buildSystemContext(mockCharacter, "Привет", null, null, {}, testChatId);
assert.ok(sysContext.includes("<hard_priority_directives>"), "Must contain hard_priority_directives");
assert.ok(sysContext.includes("КРИТИЧЕСКИЙ ПРИОРИТЕТ"), "Must contain aggressive warning");
assert.ok(sysContext.includes("Немедленно признаться в тайных чувствах"), "Must contain hard directive text");
assert.ok(sysContext.includes("<core_directives>"), "Must also contain core_directives for normal directive");
assert.ok(sysContext.includes("Любит пить зеленый чай"), "Must contain normal directive text in core block");
console.log("✔ Test 2 passed: Hard directive produces <hard_priority_directives> alongside normal directives.");

// 3. Test: buildApiMessages injects aggressive reminder into the final system_reminder
state.chats[testChatId] = [
  { role: "user", content: "Привет, о чем ты думаешь?" }
];

const messages = buildApiMessages(mockCharacter, "Привет, о чем ты думаешь?", null, null, {}, testChatId);
const lastSysMessage = messages.slice().reverse().find(m => m.role === "system" && m.content.includes("system_reminder"));
assert.ok(lastSysMessage, "Must find system_reminder message");
assert.ok(lastSysMessage.content.includes("КРИТИЧЕСКИЙ ЖЁСТКИЙ ПРИОРИТЕТ"), "Final system reminder must feature hard priority");
assert.ok(lastSysMessage.content.includes("ПРОДАВЛИВАТЬ АГРЕССИВНО"), "Must contain aggressive pushing directive");
assert.ok(lastSysMessage.content.includes("ФОНОВЫЕ УСТАНОВКИ"), "Must contain background directives section");
console.log("✔ Test 3 passed: buildApiMessages system_reminder includes aggressive push directive.");

// 4. Test: toggleDirectivePriority toggles state
toggleDirectivePriority(testChatId, "dir_1");
const dir1 = state.characterDirectives[testChatId].find(d => d.id === "dir_1");
assert.strictEqual(dir1.priority, "hard", "dir_1 should now have hard priority");

toggleDirectivePriority(testChatId, "dir_1");
assert.strictEqual(dir1.priority, "normal", "dir_1 should now have normal priority");
console.log("✔ Test 4 passed: toggleDirectivePriority toggles between hard and normal properly.");

// 5. Test: GM Mode buildGroupScenePrompt includes hard priority directives
state.sidebarTab = "gm";
state.activeGmSceneId = "scene_gm_test_1";
const gmChatId = "gm_chat_scene_gm_test_1";
global.localStorage.setItem("openrouter_active_chat_id_scene_gm_test_1", gmChatId);
state.gmScenes = [
  { id: "scene_gm_test_1", title: "Таинственный замок", scenario: "Исследование руин", participants: [] }
];
state.characterDirectives[gmChatId] = [
  { id: "dir_gm_1", text: "Внезапно обрушить потолок в зале", active: true, priority: "hard" }
];

const gmPrompt = buildGroupScenePrompt("Осматриваемся вокруг");
assert.ok(gmPrompt.includes("<hard_priority_directives>"), "GM prompt must include hard_priority_directives");
assert.ok(gmPrompt.includes("Внезапно обрушить потолок в зале"), "GM prompt must include hard directive text");
console.log("✔ Test 5 passed: GM mode scene prompt properly includes hard priority directives.");

// 6. Test: GM Mode buildApiMessages includes GM scene scenario in system_reminder
const gmMessages = buildApiMessages(null, "Осматриваемся вокруг", null, null, {}, gmChatId);
const gmReminder = gmMessages.find(m => m.role === "system" && m.content.includes("system_reminder"));
assert.ok(gmReminder, "GM system reminder must exist");
assert.ok(gmReminder.content.includes("СЦЕНАРИЙ И ОБСТАНОВКА СЦЕНЫ"), "GM system reminder must include scene scenario section");
assert.ok(gmReminder.content.includes("Исследование руин"), "GM system reminder must contain the scene scenario text");
console.log("✔ Test 6 passed: GM mode buildApiMessages system_reminder includes scene scenario reminder.");

console.log("\n🚀 All Directives and GM Scenario Tests Passed Successfully!");
