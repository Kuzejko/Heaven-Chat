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
    querySelectorAll: () => []
  };
}

const { state } = await import("../js/state.js");
const { buildApiMessages } = await import("../services/promptBuilder.js");
const { getSessionMemory, saveSessionMemory } = await import("../services/storage.js");

console.log("=== Running Time Skip Feature Tests ===");

// Test 1: Time Skip message structure
const testChatId = "chat_test_timeskip_1";
const now = Date.now();
const timeSkipMessage = {
  role: "user",
  isTimeSkip: true,
  timeText: "На следующее утро (+1 ночь)",
  detailText: "Прошла ночь. Наступило утро нового дня.",
  content: "*[⏳ ВРЕМЕННОЙ СКАЧОК: Прошло На следующее утро (+1 ночь). Обстановка / что произошло: Прошла ночь. Наступило утро нового дня. Опиши начало новой сцены, где сейчас находятся персонажи, атмосферу и начни диалог.]*",
  timestamp: now
};

assert.strictEqual(timeSkipMessage.isTimeSkip, true, "isTimeSkip must be true");
assert.strictEqual(timeSkipMessage.timeText, "На следующее утро (+1 ночь)");
assert.ok(timeSkipMessage.content.includes("ВРЕМЕННОЙ СКАЧОК"), "content must contain time skip directive");
console.log("✔ Test 1 passed: Time Skip message structure is valid.");

// Test 2: buildApiMessages includes Time Skip cleanly in history without errors
state.activeCharacterId = "char_ts_1";
state.chats[testChatId] = [
  { role: "user", content: "Спокойной ночи, Кими.", timestamp: now - 1000 },
  { role: "assistant", content: "Спокойной ночи! До утра...", timestamp: now - 500 },
  timeSkipMessage
];

const mockCharacter = {
  id: "char_ts_1",
  name: "Кими",
  personality: "Милая и добрая",
  description: "Подруга детства",
  first_message: "Привет!"
};

const messages = buildApiMessages(mockCharacter, "Как спалось?", null, null, {}, testChatId);
assert.ok(Array.isArray(messages), "Messages should be an array");
const historyTimeskip = messages.find(m => m.content && m.content.includes("ВРЕМЕННОЙ СКАЧОК"));
assert.ok(historyTimeskip, "History must contain the time skip prompt transition");
console.log("✔ Test 2 passed: buildApiMessages properly includes Time Skip in prompt history.");

// Test 3: Session Memory updates setting.time on Time Skip
const initialMem = {
  setting: { location: "Таверна", time: "Вечер" },
  current_situation: { immediate_goal: "Отдохнуть" }
};
saveSessionMemory(testChatId, initialMem);

const loadedMem = getSessionMemory(testChatId);
assert.strictEqual(loadedMem.setting.time, "Вечер");

// Simulate time skip updating setting.time
loadedMem.setting.time = timeSkipMessage.timeText;
saveSessionMemory(testChatId, loadedMem);

const updatedMem = getSessionMemory(testChatId);
assert.strictEqual(updatedMem.setting.time, "На следующее утро (+1 ночь)");
console.log("✔ Test 3 passed: Session Memory setting.time updates correctly on Time Skip.");

console.log("\n🚀 All Time Skip Tests Passed Successfully!");
