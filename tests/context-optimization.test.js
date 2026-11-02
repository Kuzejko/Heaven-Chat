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
if (typeof global.window === "undefined") {
  global.window = {};
}

const { state } = await import("../js/state.js");
const {
  buildSystemContext,
  buildGroupScenePrompt,
  buildWorldLoreCompendium,
  buildMemoryAndSummaryBlocks,
  formatRetrievedMemories
} = await import("../services/promptBuilder.js");
const {
  buildRagIndex,
  getCandidateMemories,
  retrieveRelevantMemoriesAsync,
  clearRagIndex,
  ragJevResultCache
} = await import("../services/ragService.js");
const { savePinnedFacts, saveSessionMemory } = await import("../services/storage.js");
const { DEFAULT_JEV_MODEL } = await import("../services/jevService.js");

console.log("=== Running Context Optimization, Lorebook & Prompt Caching Tests ===");

// -------------------------------------------------------------
// Test 1: character.lorebook injection with Russian morphology (Snowball stemmer)
// -------------------------------------------------------------
{
  const charId = "char_lore_test";
  const mockChar = {
    id: charId,
    name: "Маг Альтаир",
    gender: "he/him",
    description: "Древний волшебник",
    personality: "Строгий и мудрый",
    lorebook: [
      {
        keys: "магический клинок, древний амулет",
        content: "Клинок Рассвета: Выкован в пламени дракона персонажем {{char}} для {{user}}.",
        enabled: true
      },
      {
        keys: "ночные призраки",
        content: "Призраки приходят в полночь.",
        enabled: false
      }
    ]
  };

  state.characters = [mockChar];
  state.activeCharacterId = charId;
  state.chats[charId] = [
    { role: "user", content: "Я ищу древнего амулета осколок." }
  ];

  const sysContext = buildSystemContext(mockChar, "Где найти силу древнего амулета?", null, null, null, charId);

  assert.ok(sysContext.includes("<character_lorebook>"), "Context must include <character_lorebook> tag");
  assert.ok(sysContext.includes("Клинок Рассвета"), "Context must contain triggered lore content");
  assert.ok(sysContext.includes("Маг Альтаир"), "Macro {{char}} must be replaced in lorebook content");
  assert.ok(!sysContext.includes("Призраки приходят в полночь"), "Disabled lore entry must not be included");

  console.log("✔ Test 1 passed: character.lorebook is triggered with Russian inflections and macro replacements.");
}

// -------------------------------------------------------------
// Test 2: Strict Prompt Caching order (Static Prefix before Dynamic Tail)
// -------------------------------------------------------------
{
  const charId = "char_caching_test";
  const mockChar = {
    id: charId,
    name: "Селена",
    gender: "she/her",
    description: "Лунная охотница",
    personality: "Холодная, сосредоточенная",
    speech: "Говорит тихо, без лишних слов",
    behavior: "Держит лук наготове",
    appearance: "Серебряные волосы, ночной плащ",
    backstory: "Родилась в долине затмения",
    scenario: "Погоня за теневым зверем",
    systemPrompt: "Всегда проверяй следы перед шагом.",
    traits: ["Меткая", "Бесшумная"],
    hiddenTraits: ["Тайно сомневается в своем клане"],
    exampleDialogs: "— Куда идти?\n— По следам.",
    lorebook: [
      { keys: "лунный лук", content: "Лунный лук: зачарованное оружие.", enabled: true }
    ]
  };

  state.chats[charId] = [
    { role: "user", content: "Доставай свой лунный лук, враги близко!" }
  ];
  state.chatMetadata[charId] = {
    worldGenre: "fantasy",
    worldLore: {
      locations: [{ name: "Долина Затмения", description: "Вечно темная равнина" }]
    }
  };
  state.characterDirectives = {
    [charId]: [{ id: "d1", text: "Следи за шорохом в кустах", priority: "hard", active: true }]
  };
  savePinnedFacts({
    [charId]: ["У игрока сломана стрела"]
  });
  saveSessionMemory(charId, {
    setting: { location: "Опушка леса" },
    current_status: "Готовы к засаде",
    last_updated_message_id: 1
  });

  const dummyRag = [
    { text: "User: Мы видели волка позади.", messageIndex: 1, jevRelevance: 0.9 }
  ];

  const context = buildSystemContext(mockChar, "Натягивай тетиву лунного лука!", null, null, null, charId, dummyRag);

  const idxCharInfo = context.indexOf("<character_info>");
  const idxDesc = context.indexOf("<character_description>");
  const idxPersonality = context.indexOf("<personality>");
  const idxSpeech = context.indexOf("<speech_style>");
  const idxBehavior = context.indexOf("<behavior_and_habits>");
  const idxAppearance = context.indexOf("<appearance>");
  const idxBackstory = context.indexOf("<backstory>");
  const idxScenario = context.indexOf("<roleplay_scenario>");
  const idxSettingRule = context.indexOf("<setting_rule>");
  const idxCharSysPrompt = context.indexOf("<character_system_prompt>");
  const idxTraits = context.indexOf("<personality_traits>");
  const idxHiddenTraits = context.indexOf("<hidden_traits>");
  const idxUserInfo = context.indexOf("<user_info>");
  const idxPinned = context.indexOf("<pinned_memory_facts>");

  const idxDirectives = context.indexOf("<hard_priority_directives>");
  const idxLorebook = context.indexOf("<character_lorebook>");
  const idxWorldLore = context.indexOf("<world_lore_compendium>");
  const idxCodex = context.indexOf("<session_memory_codex>");
  const idxRag = context.indexOf("<retrieved_memories>");

  assert.ok(idxCharInfo !== -1 && idxCharInfo < idxDesc, "character_info < character_description");
  assert.ok(idxDesc < idxPersonality, "character_description < personality");
  assert.ok(idxPersonality < idxSpeech, "personality < speech_style");
  assert.ok(idxSpeech < idxBehavior, "speech_style < behavior_and_habits");
  assert.ok(idxBehavior < idxAppearance, "behavior_and_habits < appearance");
  assert.ok(idxAppearance < idxBackstory, "appearance < backstory");
  assert.ok(idxBackstory < idxScenario, "backstory < roleplay_scenario");
  assert.ok(idxScenario < idxSettingRule, "roleplay_scenario < setting_rule");
  assert.ok(idxSettingRule < idxCharSysPrompt, "setting_rule < character_system_prompt");
  assert.ok(idxCharSysPrompt < idxTraits, "character_system_prompt < personality_traits");
  assert.ok(idxTraits < idxHiddenTraits, "personality_traits < hidden_traits");
  assert.ok(idxHiddenTraits < idxUserInfo, "hidden_traits < user_info");
  assert.ok(idxUserInfo < idxPinned, "user_info < pinned_memory_facts");

  const lastStaticIdx = idxPinned;
  assert.ok(lastStaticIdx < idxDirectives, "pinned_memory_facts < hard_priority_directives");
  assert.ok(idxDirectives < idxLorebook, "directives < character_lorebook");
  assert.ok(idxLorebook < idxWorldLore, "character_lorebook < world_lore_compendium");
  assert.ok(idxWorldLore < idxCodex, "world_lore_compendium < session_memory_codex");
  assert.ok(idxCodex < idxRag, "session_memory_codex < retrieved_memories");

  console.log("✔ Test 2 passed: buildSystemContext strictly places static prefix before dynamic tail for Prompt Caching.");
}

// -------------------------------------------------------------
// Test 3: retrieveRelevantMemoriesAsync in-memory caching (no redundant fetch)
// -------------------------------------------------------------
{
  const chatId = "test_chat_cache";
  clearRagIndex(chatId);

  state.chats[chatId] = [
    { role: "user", content: "Где находится древний рубин дракона?" },
    { role: "assistant", content: "В глубине огненной пещеры за мостом." },
    { role: "user", content: "Кто его сторожит?" },
    { role: "assistant", content: "Каменный голем." },
    { role: "user", content: "Как его победить?" },
    { role: "assistant", content: "Используй ледяную стрелу." }
  ];
  state.chatMetadata[chatId] = {};
  state.apiSettings = { maxHistoryMessages: 2 };

  let fetchCallCount = 0;
  const originalFetch = global.fetch;

  global.fetch = async () => {
    fetchCallCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: DEFAULT_JEV_MODEL,
        answers: {
          cand_0: { type: "noul", noul: 0.91 }
        }
      })
    };
  };

  const query = "древний рубин пещера";
  const result1 = await retrieveRelevantMemoriesAsync(chatId, query, 2, "sk-mock-key");
  assert.strictEqual(fetchCallCount, 1, "First call should execute network fetch");
  assert.ok(result1.length > 0, "Should return retrieved memory");

  const result2 = await retrieveRelevantMemoriesAsync(chatId, query, 2, "sk-mock-key");
  assert.strictEqual(fetchCallCount, 1, "Second call should return cached result WITHOUT network fetch");
  assert.deepStrictEqual(result1, result2, "Cached result should match initial response");

  global.fetch = originalFetch;
  console.log("✔ Test 3 passed: retrieveRelevantMemoriesAsync serves cached results on repeated queries.");
}

// -------------------------------------------------------------
// Test 4: Weighted BM25 prioritizes userInput over assistant chatter
// -------------------------------------------------------------
{
  const chatId = "test_chat_weighted";
  clearRagIndex(chatId);

  state.chats[chatId] = [
    { role: "user", content: "Расскажи про природу." },
    { role: "assistant", content: "В саду порхает яркая бабочка, летает над зелеными цветами на лугу каждый день." },
    { role: "user", content: "А что спрятано под часовней?" },
    { role: "assistant", content: "Там скрыт тайный сундук с золотом за старым алтарем." },
    { role: "user", content: "Свежая реплика 1" },
    { role: "assistant", content: "Свежий ответ 1" },
    { role: "user", content: "Свежая реплика 2" },
    { role: "assistant", content: "Свежий ответ 2" }
  ];
  state.chatMetadata[chatId] = {};
  state.apiSettings = { maxHistoryMessages: 4 };

  const query = "бабочка цветами тайный сундук";
  const candidates = getCandidateMemories(chatId, query, 2, { userInput: "тайный сундук" });

  assert.ok(candidates.length > 0, "Should retrieve candidates");
  assert.ok(candidates[0].text.includes("тайный сундук"), "User input terms (boosted x2.5 + bigram bonus) must rank Chunk B first");

  console.log("✔ Test 4 passed: Weighted BM25 prioritizes userInput tokens (x2.5) over assistant chatter.");
}

// -------------------------------------------------------------
// Test 5: World Lore deduplication (cards included in compendium excluded from RAG)
// -------------------------------------------------------------
{
  const worldLore = {
    locations: [{ name: "Цитадель Зари", description: "Крепость на вершине скалы" }],
    rules: [{ name: "Закон Арканы", description: "Запрет магии крови" }]
  };

  const sessionMem = { setting: { location: "Цитадель Зари" } };
  const { loreBlock, includedNames } = buildWorldLoreCompendium(worldLore, "chat_wl", "привет", sessionMem);

  assert.ok(loreBlock.includes("<world_lore_compendium>"), "Compendium block should be created");
  assert.ok(includedNames.has("Цитадель Зари"), "Included names must contain Citadel");

  const mockRag = [
    { messageIndex: "Лор Мира", text: "[Энциклопедия Мира — 🏰 Локация: Цитадель Зари]: Крепость на вершине скалы" },
    { messageIndex: 5, text: "User: Мы нашли старую карту." }
  ];

  const formatted = formatRetrievedMemories(mockRag, includedNames);
  assert.ok(!formatted.includes("Цитадель Зари"), "Card already in world_lore_compendium must be excluded from retrieved_memories");
  assert.ok(formatted.includes("старую карту"), "Regular chat memory must remain in retrieved_memories");

  console.log("✔ Test 5 passed: World lore entries are cleanly deduplicated between compendium and RAG.");
}

// -------------------------------------------------------------
// Test 6: Memory vs Summary deduplication (recent_story_delta when Codex is fresh)
// -------------------------------------------------------------
{
  const chatId = "chat_dedup_test";
  saveSessionMemory(chatId, {
    setting: { location: "Таверна" },
    current_status: "Отдых у камина",
    last_updated_message_id: 10
  });

  state.chatSummaries[chatId] = `📍 ТЕКУЩАЯ СИТУАЦИЯ:
В таверну ворвались стражники в доспехах.

📖 СЮЖЕТНЫЕ ВЕХИ:
• Встретились в таверне.`;

  state.chatSummarizedMessageCount[chatId] = 12;

  const blocks = buildMemoryAndSummaryBlocks(chatId, 12, true);
  const combined = blocks.join("\n\n");

  assert.ok(combined.includes("<session_memory_codex>"), "Fresh codex must be included");
  assert.ok(!combined.includes("<story_summary>"), "Full story_summary must NOT be duplicated when codex is fresh");
  assert.ok(combined.includes("<recent_story_delta>"), "Fresher summary must yield <recent_story_delta>");
  assert.ok(combined.includes("В таверну ворвались стражники"), "Delta must contain only the fresh situation");

  console.log("✔ Test 6 passed: Memory vs summary deduplication produces compact recent_story_delta without full summary repetition.");
}

console.log("\n🚀 All Context Optimization & Prompt Caching Tests Passed Successfully!\n");
