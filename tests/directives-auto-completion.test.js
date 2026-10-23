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
const { checkAndCompleteDirectives, toggleDirectiveMode } = await import("../js/ui.js");
const { buildApiMessages } = await import("../services/promptBuilder.js");

console.log("=== Running Directives Auto-Completion & Anti-Loop Tests ===");

const testChatId = "chat_test_auto_completion_1";
state.activeCharacterId = "char_ac_1";
state.sidebarTab = "characters";
state.apiSettings = { chatLanguage: "ru" };

// -------------------------------------------------------------
// Test 1: Auto mode completion with <!-- GOAL_REACHED: 1 -->
// -------------------------------------------------------------
state.characterDirectives = {
  [testChatId]: [
    { id: "dir_1", text: "Предложить пойти в таверну выпить эля", active: true, mode: "auto" },
    { id: "dir_2", text: "Скрывать тайный шрам на плече", active: true, mode: "auto" }
  ]
};

const rawMessage = "*Улыбается и кивает*\nСлушай, а давай заглянем в таверну 'Пьяный дракон' и пропустим по кружке эля?\n<!-- GOAL_REACHED: 1 -->";
const result1 = checkAndCompleteDirectives(testChatId, rawMessage);

assert.strictEqual(result1.completedDirectives.length, 1, "Should complete 1 directive");
assert.strictEqual(result1.completedDirectives[0].id, "dir_1", "Should complete directive 1");
assert.strictEqual(state.characterDirectives[testChatId][0].active, false, "Directive 1 must be deactivated");
assert.strictEqual(state.characterDirectives[testChatId][0].completed, true, "Directive 1 must be marked as completed");
assert.strictEqual(state.characterDirectives[testChatId][1].active, true, "Directive 2 must remain active");
assert.ok(!result1.cleanContent.includes("GOAL_REACHED"), "Tag must be cleanly stripped from final message");
assert.ok(result1.cleanContent.includes("Пьяный дракон"), "Message content must be preserved");
console.log("✔ Test 1 passed: <!-- GOAL_REACHED: 1 --> deactivates directive and strips tag.");

// -------------------------------------------------------------
// Test 2: Mode 'once' (⚡ 1x) auto-completes after 1 turn
// -------------------------------------------------------------
state.characterDirectives = {
  [testChatId]: [
    { id: "dir_once", text: "Передать карту сокровищ", active: true, mode: "once" }
  ]
};

const messageWithoutTag = "*Достает из сумки старинную карту и протягивает её.* Вот, держи.";
const result2 = checkAndCompleteDirectives(testChatId, messageWithoutTag);

assert.strictEqual(result2.completedDirectives.length, 1, "Once-mode directive should auto-complete");
assert.strictEqual(state.characterDirectives[testChatId][0].active, false, "Once-mode directive must become inactive");
assert.strictEqual(state.characterDirectives[testChatId][0].completed, true, "Once-mode directive must be completed");
console.log("✔ Test 2 passed: 'once' mode directive auto-completes on reply.");

// -------------------------------------------------------------
// Test 3: Mode 'keep' (♾️) persists even if goal tag is returned
// -------------------------------------------------------------
state.characterDirectives = {
  [testChatId]: [
    { id: "dir_keep", text: "Всегда говорить с легким акцентом", active: true, mode: "keep" }
  ]
};

const keepMessage = "*Усмехается* Да-да, мой друг!\n<!-- GOAL_REACHED: 1 -->";
const result3 = checkAndCompleteDirectives(testChatId, keepMessage);

assert.strictEqual(result3.completedDirectives.length, 0, "Keep-mode directive must not be auto-completed");
assert.strictEqual(state.characterDirectives[testChatId][0].active, true, "Keep-mode directive must stay active");
assert.ok(!result3.cleanContent.includes("GOAL_REACHED"), "Tag should still be stripped from message");
console.log("✔ Test 3 passed: 'keep' mode directive never auto-completes.");

// -------------------------------------------------------------
// Test 4: Multiple directives completion <!-- GOAL_REACHED: 1, 2 -->
// -------------------------------------------------------------
state.characterDirectives = {
  [testChatId]: [
    { id: "dir_a", text: "Сказать пароль", active: true, mode: "auto" },
    { id: "dir_b", text: "Открыть дверь ключом", active: true, mode: "auto" }
  ]
};

const multiMessage = "Пароль 'Полночь'! *Поворачивает ключ в замке.*\n<!-- GOAL_REACHED: 1, 2 -->";
const result4 = checkAndCompleteDirectives(testChatId, multiMessage);

assert.strictEqual(result4.completedDirectives.length, 2, "Both directives should be completed");
assert.strictEqual(state.characterDirectives[testChatId][0].active, false, "Directive A inactive");
assert.strictEqual(state.characterDirectives[testChatId][1].active, false, "Directive B inactive");
console.log("✔ Test 4 passed: Multiple directives completed via comma-separated tag.");

// -------------------------------------------------------------
// Test 5: Mode toggling cycle: auto -> once -> keep -> auto
// -------------------------------------------------------------
state.characterDirectives = {
  [testChatId]: [
    { id: "dir_toggle", text: "Тестовая идея", active: true, mode: "auto" }
  ]
};

toggleDirectiveMode(testChatId, "dir_toggle");
assert.strictEqual(state.characterDirectives[testChatId][0].mode, "once", "Mode should toggle to 'once'");

toggleDirectiveMode(testChatId, "dir_toggle");
assert.strictEqual(state.characterDirectives[testChatId][0].mode, "keep", "Mode should toggle to 'keep'");

toggleDirectiveMode(testChatId, "dir_toggle");
assert.strictEqual(state.characterDirectives[testChatId][0].mode, "auto", "Mode should loop back to 'auto'");
console.log("✔ Test 5 passed: toggleDirectiveMode cycles correctly (auto -> once -> keep -> auto).");

// -------------------------------------------------------------
// Test 6: Anti-looping and dynamic progression in prompts
// -------------------------------------------------------------
const mockCharacter = {
  id: "char_ac_1",
  name: "Алиса",
  personality: "Детектив",
  description: "Ищет улики"
};

const messages = buildApiMessages(mockCharacter, [
  { role: "user", content: "Куда пойдем?" },
  { role: "assistant", content: "Пойдем к старому особняку." }
], "Дальше?", {}, testChatId);

const systemReminder = messages[messages.length - 1].content;
assert.ok(systemReminder.includes("СТРОГИЙ ЗАПРЕТ САМОПОВТОРА (ANTI-LOOP)"), "Must contain anti-looping rules");
assert.ok(systemReminder.includes("Anti-Loop & Динамическая прогрессия"), "Must instruct scene progression");
console.log("✔ Test 6 passed: Anti-looping and dynamic progression rules are injected into prompt.");

console.log("\n🎉 ALL DIRECTIVES AUTO-COMPLETION & ANTI-LOOP TESTS PASSED SUCCESSFULLY!");
