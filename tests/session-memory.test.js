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

// Mock document/window if needed
if (typeof global.document === "undefined") {
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const {
  createDefaultSessionMemory,
  formatMemoryToMarkdown,
  smartMergeSessionMemory,
  cleanJsonOutput
} = await import("../services/sessionMemoryService.js");

const {
  getSessionMemory,
  saveSessionMemory,
  loadSessionMemories,
  saveSessionMemories,
  clearAllStorageData
} = await import("../services/storage.js");

const { state } = await import("../js/state.js");
const { exportAllDataJSON } = await import("../js/config.js");

console.log("=== Running Structured Session Memory Tests ===");

// -------------------------------------------------------------
// Test 1: createDefaultSessionMemory schema integrity
// -------------------------------------------------------------
const defaultMem = createDefaultSessionMemory();
assert.ok(defaultMem, "Default session memory should not be null");
assert.strictEqual(typeof defaultMem.setting, "object");
assert.strictEqual(typeof defaultMem.characters, "object");
assert.ok(Array.isArray(defaultMem.key_events));
assert.ok(Array.isArray(defaultMem.unresolved_threads));
assert.strictEqual(typeof defaultMem.intimate_notes, "object");
assert.strictEqual(defaultMem.current_status, "");
console.log("✔ Test 1 passed: createDefaultSessionMemory produces valid schema.");

// -------------------------------------------------------------
// Test 2: formatMemoryToMarkdown serialization
// -------------------------------------------------------------
const testMem = {
  setting: {
    location: "Таверна 'Темный Лес'",
    time: "Полночь",
    atmosphere: "Дождливо, пахнет дымом",
    world_rules: ["Магия наказуема"]
  },
  current_status: "Прячутся за барной стойкой от патруля",
  characters: {
    "Лия": {
      physical_state: "Легкое ранение руки",
      emotional_state: "Встревожена",
      relationships: { "User": "Доверяет, но держит дистанцию" },
      goals: ["Найти карту катакомб"],
      important_traits: ["Ловкая", "Осторожная"],
      notes: "Прячет фамильный кинжал"
    }
  },
  intimate_notes: {
    dynamics: "Напряженный зрительный контакт",
    boundaries: ["Без грубости"],
    preferences: ["Тихий шепот"],
    recent_events: ["User перевязал ей плечо"]
  },
  unresolved_threads: [
    "Кто сообщил страже о встрече?"
  ],
  key_events: [
    {
      summary: "Встретились в таверне и ушли от погони",
      consequences: "Стража ищет их по городу",
      timestamp: "Ход 3"
    }
  ],
  last_updated_message_id: 5
};

const md = formatMemoryToMarkdown(testMem);
assert.ok(md.includes("# 🧠 STRUCTURED MEMORY CONTEXT"), "Should have header");
assert.ok(md.includes("Таверна 'Темный Лес'"), "Should include location");
assert.ok(md.includes("Прячутся за барной стойкой"), "Should include current status");
assert.ok(md.includes("Лия"), "Should include character name");
assert.ok(md.includes("Встревожена"), "Should include character emotional state");
assert.ok(md.includes("Напряженный зрительный контакт"), "Should include intimate dynamics");
assert.ok(md.includes("Кто сообщил страже о встрече?"), "Should include unresolved thread");
assert.ok(md.includes("Встретились в таверне"), "Should include key event");
console.log("✔ Test 2 passed: formatMemoryToMarkdown correctly serializes all blocks.");

// -------------------------------------------------------------
// Test 3: smartMergeSessionMemory preserves manual user edits
// -------------------------------------------------------------
const existingMem = {
  setting: {
    location: "Тайное убежище",
    time: "Утро",
    atmosphere: "Холодно",
    world_rules: ["Правило 1"]
  },
  current_status: "Отдыхают",
  characters: {
    "Лия": {
      physical_state: "Рана затянулась",
      emotional_state: "Спокойна",
      relationships: { "User": "Влюблена" },
      goals: ["Позавтракать"],
      important_traits: ["Добрая"],
      notes: "Ручная заметка пользователя!"
    },
    "Второй Персонаж": {
      physical_state: "Здоров",
      emotional_state: "Бодр",
      relationships: {},
      goals: [],
      important_traits: [],
      notes: "Не должен исчезнуть при слиянии"
    }
  },
  intimate_notes: {
    dynamics: "Теплые объятия",
    boundaries: ["Личное пространство"],
    preferences: ["Кофе в постель"],
    recent_events: ["Разговор у камина"]
  },
  unresolved_threads: [
    "Ручной сюжетный крючок от игрока"
  ],
  key_events: [
    { summary: "Старое событие", consequences: "Никаких", timestamp: "Ход 1" }
  ],
  last_updated_message_id: 10
};

// Simulated partial update from LLM that omitted "Второй Персонаж"
const llmUpdate = {
  setting: {
    location: "Тайное убежище",
    time: "Полдень",
    atmosphere: "Солнечно",
    world_rules: ["Правило 2"]
  },
  current_status: "Готовятся к выходу",
  characters: {
    "Лия": {
      physical_state: "Бодра",
      emotional_state: "Решительна",
      relationships: { "Leo": "Недоверие" },
      goals: ["Купить припасы"],
      important_traits: ["Смелая"],
      notes: "" // LLM returned empty notes
    }
  },
  intimate_notes: {
    dynamics: "Доверительный диалог",
    boundaries: [],
    preferences: ["Поцелуй на прощание"],
    recent_events: ["Собрали вещи вместе"]
  },
  unresolved_threads: [
    "Новый крючок от ИИ"
  ],
  key_events: [
    { summary: "Старое событие", consequences: "Никаких", timestamp: "Ход 1" }, // Duplicate
    { summary: "Вышли на рыночную площадь", consequences: "Заметили слежку", timestamp: "Ход 12" }
  ],
  last_updated_message_id: 12
};

const merged = smartMergeSessionMemory(existingMem, llmUpdate, 12);

// Assert setting merged
assert.strictEqual(merged.setting.time, "Полдень");
assert.ok(merged.setting.world_rules.includes("Правило 1"));
assert.ok(merged.setting.world_rules.includes("Правило 2"));

// Assert characters merged & preserved
assert.ok(merged.characters["Второй Персонаж"], "Omitted character must NOT be dropped");
assert.strictEqual(merged.characters["Лия"].notes, "Ручная заметка пользователя!", "Manual note preserved");
assert.strictEqual(merged.characters["Лия"].relationships["User"], "Влюблена", "Existing relationship preserved");
assert.strictEqual(merged.characters["Лия"].relationships["Leo"], "Недоверие", "New relationship added");
assert.ok(merged.characters["Лия"].goals.includes("Позавтракать"));
assert.ok(merged.characters["Лия"].goals.includes("Купить припасы"));

// Assert unresolved threads merged
assert.ok(merged.unresolved_threads.includes("Ручной сюжетный крючок от игрока"));
assert.ok(merged.unresolved_threads.includes("Новый крючок от ИИ"));

// Assert key events deduplicated
assert.strictEqual(merged.key_events.length, 2, "Duplicate events should be deduplicated");
assert.strictEqual(merged.last_updated_message_id, 12);
console.log("✔ Test 3 passed: smartMergeSessionMemory cleanly preserves user edits and deduplicates.");

// -------------------------------------------------------------
// Test 4: cleanJsonOutput robustness
// -------------------------------------------------------------
const rawWithFences = '```json\n{"setting":{"location":"Лес"}}\n```';
assert.strictEqual(cleanJsonOutput(rawWithFences), '{"setting":{"location":"Лес"}}');

const rawWithThoughts = '<thought>Thinking about memory...</thought>{"current_status":"У костра"}';
assert.strictEqual(cleanJsonOutput(rawWithThoughts), '{"current_status":"У костра"}');
console.log("✔ Test 4 passed: cleanJsonOutput strips markdown fences and thought tags.");

// -------------------------------------------------------------
// Test 5: Storage persistence and Export
// -------------------------------------------------------------
clearAllStorageData();
saveSessionMemory("chat_test_123", testMem);
const loaded = getSessionMemory("chat_test_123");
assert.ok(loaded, "Loaded memory must exist");
assert.strictEqual(loaded.setting.location, "Таверна 'Темный Лес'");

state.sessionMemories = { chat_test_123: loaded };
const exportData = exportAllDataJSON();
assert.ok(exportData.sessionMemories, "Export JSON must contain sessionMemories");
assert.strictEqual(exportData.sessionMemories.chat_test_123.setting.location, "Таверна 'Темный Лес'");
console.log("✔ Test 5 passed: Session memory storage and JSON export verified.");

// -------------------------------------------------------------
// Test 6: resolved threads are removed, open threads kept, lists capped
// -------------------------------------------------------------
const cleanupBase = {
  ...createDefaultSessionMemory(),
  unresolved_threads: ["Кто предал караван?", "Долг перед гильдией"],
  intimate_notes: { dynamics: "", boundaries: [], preferences: [], recent_events: [] }
};
const afterResolve = smartMergeSessionMemory(cleanupBase, {
  unresolved_threads: ["Новый вопрос"],
  resolved_threads: ["кто предал караван?  "]
}, 20);
assert.ok(!afterResolve.unresolved_threads.includes("Кто предал караван?"), "Resolved thread must be removed");
assert.ok(afterResolve.unresolved_threads.includes("Долг перед гильдией"), "Open thread must stay");
assert.ok(afterResolve.unresolved_threads.includes("Новый вопрос"), "New thread must be added");

const manyThreads = Array.from({ length: 20 }, (_, i) => `Нить ${i}`);
const capped = smartMergeSessionMemory(createDefaultSessionMemory(), { unresolved_threads: manyThreads }, 1);
assert.strictEqual(capped.unresolved_threads.length, 12, "Threads must be capped");
assert.strictEqual(capped.unresolved_threads[capped.unresolved_threads.length - 1], "Нить 19", "Cap keeps newest threads");

const manyEvents = Array.from({ length: 70 }, (_, i) => ({ summary: `Событие ${i}`, consequences: "", timestamp: "" }));
const cappedEvents = smartMergeSessionMemory(createDefaultSessionMemory(), { key_events: manyEvents }, 1);
assert.strictEqual(cappedEvents.key_events.length, 60, "Stored key events must be capped");
const promptMd = formatMemoryToMarkdown(cappedEvents);
assert.ok(promptMd.includes("Событие 69"), "Newest event must be in prompt");
assert.ok(promptMd.includes("Событие 58"), "Prompt must include the last 12 events");
assert.ok(!promptMd.includes("Событие 57"), "Prompt must not include older events");
console.log("✔ Test 6 passed: resolved threads removed, lists and events capped.");

console.log("\n🚀 All Structured Session Memory Tests Passed Successfully!\n");
