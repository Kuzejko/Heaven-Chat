import assert from "assert";

// Mock localStorage for node environment
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

if (typeof global.document === "undefined") {
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const {
  appendMessage,
  getChatTotalMessageCount,
  getArchivedRagChunks,
  clearArchivedRagChunks,
  pruneArchivedRagChunks,
  getSessionMemory,
  saveSessionMemory,
  saveCharacters,
  clearAllStorageData
} = await import("../services/storage.js");

const {
  buildRagIndex,
  enrichChunksWithPrecedingContext
} = await import("../services/ragService.js");

const {
  createDefaultSessionMemory,
  formatMemoryToMarkdown,
  smartMergeSessionMemory
} = await import("../services/sessionMemoryService.js");

const {
  compressOlderHistoryMessage
} = await import("../services/promptBuilder.js");

const {
  evaluateTurnWithJev,
  JEV_STATE_DELTA_MAP,
  JEV_MOOD_CHOICES
} = await import("../services/jevService.js");

const { state } = await import("../js/state.js");

console.log("=== Running Memory & RAG v2 Upgrade Tests ===");

// -------------------------------------------------------------
// Test 1: Monotonic seq & Archived RAG past 200 messages
// -------------------------------------------------------------
console.log("Testing monotonic seq and RAG archiving past 200 messages...");
clearAllStorageData();
state.chats = {};
state.characters = [{ id: "char-test-1", name: "Тестовый Герой" }];
saveCharacters(state.characters);

const chatId = "char-test-1";
state.chats[chatId] = [];

// Append 220 messages (exceeding CHAT_HISTORY_LIMIT = 200)
for (let i = 1; i <= 220; i++) {
  const role = i % 2 === 1 ? "user" : "assistant";
  const content = role === "user"
    ? `Вопрос пользователя номер ${i}`
    : `Развернутый ответ ассистента номер ${i} с важной сюжетной информацией.`;
  state.chats = appendMessage(state.chats, chatId, { role, content });
}

const currentChat = state.chats[chatId];
assert.strictEqual(currentChat.length, 200, "Active chat window must be capped at 200 messages");

// Total message count should accurately reflect the 220 total messages
const totalCount = getChatTotalMessageCount(currentChat);
assert.strictEqual(totalCount, 220, "Total message count must be 220 via lastMsg.seq");

// The first message currently in active window should have seq = 21
assert.strictEqual(currentChat[0].seq, 21, "First message in active window should have seq 21");
assert.strictEqual(currentChat[currentChat.length - 1].seq, 220, "Last message in active window should have seq 220");

// Archived RAG chunks should have captured the evicted 20 messages
const archivedChunks = getArchivedRagChunks(chatId);
assert.ok(archivedChunks.length > 0, "Archived RAG chunks must contain evicted messages");
assert.strictEqual(archivedChunks[0].messageIndex, 1, "First archived chunk must start at messageIndex 1");
assert.ok(archivedChunks[0].text.includes("Тестовый Герой:"), "Archived chunk must preserve character speaker name");
assert.ok(archivedChunks[0].text.includes("User:"), "Archived chunk must preserve user speaker name");

// Build RAG index and verify that evicted messages are indexed
const ragIndex = buildRagIndex(chatId);
const indexedFromEvicted = ragIndex.chunks.some(chunk => chunk.messageIndex <= 20);
assert.ok(indexedFromEvicted, "RAG index must include chunks from archived/evicted messages");

// Test pruning archived chunks on rollback
pruneArchivedRagChunks(chatId, 10);
const prunedChunks = getArchivedRagChunks(chatId);
const allBelowTarget = prunedChunks.every(c => (c.messageIndex || 0) <= 10);
assert.ok(allBelowTarget, "pruneArchivedRagChunks must remove archived chunks above target seq");

console.log("✔ Test 1 passed: Monotonic seq and RAG archiving past 200 messages work flawlessly.");

// -------------------------------------------------------------
// Test 2: smartMergeSessionMemory limits, completed_goals, character dedup & player normalization
// -------------------------------------------------------------
console.log("Testing smartMergeSessionMemory rules and limits...");
const existingMemory = createDefaultSessionMemory();
existingMemory.characters = {
  "Эльза": {
    role: "Маг льда",
    goals: ["Найти древний артефакт", "Защитить северные земли"],
    important_traits: ["холодная", "решительная", "умная", "стойкая", "наблюдательная", "гордая", "сдержанная", "могущественная"],
    notes: "Скрывает свое истинное происхождение.",
    relationships: {
      "User": "Нейтральный",
      "эльза": "Союзник"
    }
  }
};
existingMemory.permanent_anchors = ["Эльза потеряла посох в битве при Нордсколе"];

const updateFromLLM = {
  completed_goals: ["Найти древний артефакт"],
  permanent_anchors: [
    "Эльза потеряла посох в битве при Нордсколе", // duplicate
    "У Эльзы шрам на левом плече от ледяной стрелы" // new anchor
  ],
  characters: {
    "эльза": {
      role: "Архимаг льда",
      goals: ["Найти древний артефакт", "Изучить звездный свиток"], // Total 3 unique goals (< limit 5)
      completed_goals: ["Найти древний артефакт"],
      important_traits: ["мудрая", "спокойная"],
      notes: "Начала доверять спутникам.",
      relationships: {
        "Игрок": "Друг" // Should normalize to canonical "User"
      }
    }
  }
};

const merged = smartMergeSessionMemory(existingMemory, updateFromLLM, 220);

// Check completed_goals purged and character deduplication
const charKeys = Object.keys(merged.characters);
assert.strictEqual(charKeys.length, 1, "Character names must be merged case-insensitively without duplicate profiles");
const elzaChar = merged.characters[charKeys[0]];
assert.ok(elzaChar, "Character Эльза must exist");
assert.ok(!elzaChar.goals.includes("Найти древний артефакт"), "Completed goal 'Найти древний артефакт' must be completely removed");
assert.strictEqual(elzaChar.goals.length, 2, "Goals count must be 2 (< 5), proving filtering by completedSet rather than capList");
assert.deepStrictEqual(elzaChar.goals, ["Защитить северные земли", "Изучить звездный свиток"], "Remaining goals must match uncompleted ones");
assert.ok(elzaChar.important_traits.length <= 8, `Character traits must be capped at 8, got ${elzaChar.important_traits.length}`);

// Check player name normalization in relationships
assert.ok(!elzaChar.relationships["Игрок"], "Non-canonical key 'Игрок' must be normalized");
assert.ok(elzaChar.relationships["User"], "Canonical key 'User' must be present in relationships");
assert.strictEqual(elzaChar.relationships["User"], "Друг", "Canonical 'User' relationship should be updated with new status");

// Check permanent anchors
assert.strictEqual(merged.permanent_anchors.length, 2, "Duplicate permanent anchors must be deduplicated");
assert.ok(merged.permanent_anchors.includes("У Эльзы шрам на левом плече от ледяной стрелы"));

console.log("✔ Test 2 passed: smartMergeSessionMemory successfully purges completed goals, enforces caps, dedups characters, and merges anchors.");

// -------------------------------------------------------------
// Test 3: Privacy in Duo Mode (formatMemoryToMarkdown)
// -------------------------------------------------------------
console.log("Testing Duo mode privacy in formatMemoryToMarkdown...");
const duoMemory = createDefaultSessionMemory();
duoMemory.characters = {
  "Лия": {
    role: "Разведчик",
    goals: ["Найти тропу"],
    important_traits: ["ловкая"],
    notes: "Личные тайные мысли Лии: влюблена в игрока."
  },
  "Эльза": {
    role: "Маг",
    goals: ["Охранять лагерь"],
    important_traits: ["строгая"],
    notes: "Секретные планы Эльзы: готовит предательство."
  }
};

// In Duo mode for active character "Лия"
const mdForLiya = formatMemoryToMarkdown(duoMemory, { activeCharacterName: "Лия", isDuo: true });
assert.ok(mdForLiya.includes("Личные тайные мысли Лии"), "Лия's own notes should be visible to Лия");
assert.ok(!mdForLiya.includes("Секретные планы Эльзы"), "Эльза's private notes must be hidden from Лия in Duo mode");

// In non-Duo / GM mode: all notes visible
const mdForGM = formatMemoryToMarkdown(duoMemory, { activeCharacterName: null, isDuo: false });
assert.ok(mdForGM.includes("Личные тайные мысли Лии"), "All notes visible in GM mode");
assert.ok(mdForGM.includes("Секретные планы Эльзы"), "All notes visible in GM mode");

console.log("✔ Test 3 passed: formatMemoryToMarkdown strictly protects character privacy in Duo mode.");

// -------------------------------------------------------------
// Test 4: RAG Chunk Enrichment (Location tag & Neighbor context)
// -------------------------------------------------------------
console.log("Testing RAG chunk enrichment with location and preceding context...");
const rawChunks = [
  {
    messageIndex: 10,
    speaker: "User",
    text: "Где находится древний храм?",
    queryMatches: []
  },
  {
    messageIndex: 12, // adjacent turn (diff <= 2)
    speaker: "Эльза",
    text: "Храм сокрыт за туманным перевалом на вершине скалы.",
    queryMatches: []
  },
  {
    messageIndex: 30, // distant turn (diff > 2)
    speaker: "Эльза",
    text: "Мы наконец добрались до главных ворот.",
    queryMatches: []
  }
];

// Enrich chunk 12 (omitting chunk 10 from selection)
const selected = [rawChunks[1], rawChunks[2]];
const enriched = enrichChunksWithPrecedingContext(selected, rawChunks);

assert.ok(
  enriched[0].text.includes("[Контекст перед этим:"),
  "Adjacent chunk (diff <= 2) should receive preceding turn context prefix"
);
assert.ok(
  enriched[0].text.includes("Где находится древний храм?"),
  "Context prefix must contain previous turn snippet"
);
assert.ok(
  !enriched[1].text.includes("[Контекст перед этим:"),
  "Distant chunk without adjacent predecessor in allChunks should not receive prefix"
);

console.log("✔ Test 4 passed: RAG chunk enrichment with preceding context verified.");

// -------------------------------------------------------------
// Test 5: History Compression (compressOlderHistoryMessage)
// -------------------------------------------------------------
console.log("Testing compressOlderHistoryMessage...");
const shortText = "*Она тихо вздохнула.* «Хорошо, пойдём вместе.»";
const shortResult = compressOlderHistoryMessage(shortText, 420);
assert.strictEqual(shortResult, shortText, "Short messages under maxChars should remain untouched");

// Long literary message
const longText = `*Она медленно переступает порог заброшенного святилища, с опаской оглядывая покрытые вековым мхом гранитные колонны.* В воздухе витает тяжелый запах сырости, древней магии и увядших цветов. Каждый её шаг гулким эхом отдается под сводами старого зала. Тени пляшут по стенам от неровного света факела, словно живые призраки ушедшей эпохи. «Ты уверен, что это место безопасно?» — тихо произносит она, задерживая дыхание и прислушиваясь к каждому шороху в темноте. Где-то в глубине коридора капает вода. Раз, два, три... Время тянется мучительно медленно, словно густая смола. Сердце колотится в груди, отбивая тревожный ритм. «Я чувствую чьё-то присутствие впереди!» — вскрикивает она мгновение спустя. Она делает еще несколько осторожных шагов к алтарю, внимательно всматриваясь во тьму. *Она решительно обнажает свой клинок и застывает в боевой стойке.*`;

assert.ok(longText.length > 500, "Sample text should be longer than 500 characters");

const compressed = compressOlderHistoryMessage(longText, 420);

// Assert dialogue quotes preserved 100%
assert.ok(compressed.includes("«Ты уверен, что это место безопасно?»"), "First dialogue quote must be preserved 100%");
assert.ok(compressed.includes("«Я чувствую чьё-то присутствие впереди!»"), "Second dialogue quote must be preserved 100%");

// Assert opening and closing actions preserved
assert.ok(compressed.includes("*Она медленно переступает порог заброшенного святилища"), "Opening action must be preserved");
assert.ok(compressed.includes("*Она решительно обнажает свой клинок и застывает в боевой стойке.*"), "Closing action must be preserved");

// Assert intermediate narrative replaced by [...]
assert.ok(compressed.includes("[...]"), "Middle narrative should be replaced by [...]");
assert.ok(compressed.length <= 420, `Compressed message length must be <= 420, got ${compressed.length}`);

console.log("✔ Test 5 passed: compressOlderHistoryMessage preserves dialogues and boundaries while compressing fluff.");

// -------------------------------------------------------------
// Test 6: Unified Turn Evaluation with Jev (evaluateTurnWithJev)
// -------------------------------------------------------------
console.log("Testing evaluateTurnWithJev single batch call...");

// Verify mapping constants
assert.strictEqual(JEV_STATE_DELTA_MAP.strong_gain, 3);
assert.strictEqual(JEV_STATE_DELTA_MAP.slight_gain, 1);
assert.strictEqual(JEV_STATE_DELTA_MAP.unchanged, 0);
assert.strictEqual(JEV_STATE_DELTA_MAP.slight_drop, -1);
assert.strictEqual(JEV_STATE_DELTA_MAP.strong_drop, -3);

assert.ok(JEV_MOOD_CHOICES.includes("neutral"));
assert.ok(JEV_MOOD_CHOICES.includes("flirty"));
assert.ok(JEV_MOOD_CHOICES.includes("angry"));

// Test without API key returns ok: false gracefully
const noKeyResult = await evaluateTurnWithJev({
  apiKey: "",
  activeDirectives: [],
  character: { name: "Лия" },
  userMessage: "Привет",
  characterResponse: "Здравствуй"
});
assert.strictEqual(noKeyResult.ok, false, "Should return ok: false when apiKey is empty");

console.log("✔ Test 6 passed: evaluateTurnWithJev interfaces and mappings verified.");

console.log("\n🚀 All 6 Memory & RAG v2 Upgrade Tests Passed Successfully!");
