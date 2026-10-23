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

// Mock window/document
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

// Import services to test
const {
  askJevSystemOne,
  askJevNoul,
  rerankMemoriesWithJev,
  OPENROUTER_SYSTEMONE_URL,
  DEFAULT_JEV_MODEL
} = await import("../services/jevService.js");

const {
  buildRagIndex,
  getCandidateMemories,
  retrieveRelevantMemories,
  retrieveRelevantMemoriesAsync,
  clearRagIndex
} = await import("../services/ragService.js");

const {
  buildSystemContext,
  buildApiMessages
} = await import("../services/promptBuilder.js");

const { state } = await import("../js/state.js");

console.log("=== Running TypeSafe AI Jev & RAG Memory Tests ===");

// -------------------------------------------------------------
// Test 1: Jev Service low-level payload structure & System One API
// -------------------------------------------------------------
{
  let capturedUrl = null;
  let capturedOptions = null;

  // Mock global.fetch
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: DEFAULT_JEV_MODEL,
        answers: {
          q_test: {
            type: "noul",
            noul: 0.94
          }
        },
        usage: { input_tokens: 45, output_tokens: 0 }
      })
    };
  };

  const res = await askJevSystemOne({
    apiKey: "sk-or-v1-mockkey123",
    state: "The user mentions they lost their sword in the Dark Forest.",
    questions: {
      q_test: {
        type: "noul",
        instructions: "Did the user mention an item?"
      }
    }
  });

  assert.strictEqual(res.ok, true, "Response should be ok");
  assert.strictEqual(capturedUrl, OPENROUTER_SYSTEMONE_URL, "Should call OpenRouter System One URL");
  assert.strictEqual(capturedOptions.method, "POST", "Should use POST method");
  
  const headers = capturedOptions.headers;
  assert.strictEqual(headers["Authorization"], "Bearer sk-or-v1-mockkey123", "Authorization header check");
  assert.strictEqual(headers["Content-Type"], "application/json", "Content-Type header check");

  const body = JSON.parse(capturedOptions.body);
  assert.strictEqual(body.model, DEFAULT_JEV_MODEL, "Should default to ~typesafe/jev-latest");
  assert.strictEqual(body.state, "The user mentions they lost their sword in the Dark Forest.");
  assert.strictEqual(res.answers.q_test.noul, 0.94, "Should correctly return Noul probability");

  // Restore fetch
  global.fetch = originalFetch;
  console.log("✔ Test 1 passed: askJevSystemOne constructs valid OpenRouter System One payload.");
}

// -------------------------------------------------------------
// Test 2: askJevNoul convenience helper
// -------------------------------------------------------------
{
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: DEFAULT_JEV_MODEL,
      answers: {
        q_main: {
          type: "noul",
          noul: 0.88
        }
      }
    })
  });

  const prob = await askJevNoul({
    apiKey: "sk-mock-key",
    stateText: "I promise I will return before sunrise.",
    instructions: "Was a promise made by the speaker?"
  });

  assert.strictEqual(prob, 0.88, "Noul probability should match mock response");

  global.fetch = originalFetch;
  console.log("✔ Test 2 passed: askJevNoul successfully returns calibrated probability.");
}

// -------------------------------------------------------------
// Test 3: rerankMemoriesWithJev batch candidate evaluation
// -------------------------------------------------------------
{
  const originalFetch = global.fetch;
  let receivedBody = null;

  global.fetch = async (url, options) => {
    receivedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: DEFAULT_JEV_MODEL,
        answers: {
          cand_0: { type: "noul", noul: 0.92 }, // Highly relevant (sword promise)
          cand_1: { type: "noul", noul: 0.15 }, // Irrelevant (weather chatter)
          cand_2: { type: "noul", noul: 0.78 }  // Moderately relevant (location clue)
        }
      })
    };
  };

  const candidates = [
    { text: "Character: I swear I will protect your silver sword with my life.", messageIndex: 12, score: 1.2 },
    { text: "User: It seems quite cloudy today, might rain.", messageIndex: 25, score: 0.9 },
    { text: "Character: The ancient temple lies deep inside the Whispering Caverns.", messageIndex: 30, score: 0.8 }
  ];

  const reranked = await rerankMemoriesWithJev({
    apiKey: "sk-mock-key",
    currentContext: "User: Do you remember the silver sword you promised to keep?",
    candidateChunks: candidates,
    threshold: 0.50,
    topK: 2
  });

  // Verify single-query batch structure
  assert.ok(receivedBody.questions.cand_0, "cand_0 question should be present");
  assert.ok(receivedBody.questions.cand_1, "cand_1 question should be present");
  assert.ok(receivedBody.questions.cand_2, "cand_2 question should be present");

  // Verify filtered and sorted output
  assert.strictEqual(reranked.length, 2, "Should return top 2 candidates passing threshold");
  assert.strictEqual(reranked[0].messageIndex, 12, "Highest relevance chunk should be ranked first");
  assert.strictEqual(reranked[0].jevRelevance, 0.92);
  assert.strictEqual(reranked[1].messageIndex, 30, "Second chunk should be ranked second");
  assert.strictEqual(reranked[1].jevRelevance, 0.78);

  global.fetch = originalFetch;
  console.log("✔ Test 3 passed: rerankMemoriesWithJev filters and ranks candidate memories in a single call.");
}

// -------------------------------------------------------------
// Test 4: RAG Service indexing & candidate extraction
// -------------------------------------------------------------
{
  const chatId = "test_chat_rag_1";
  clearRagIndex(chatId);

  // Setup mock chat history (14 messages; last 8 are excluded from RAG as active raw window)
  const messages = [];
  for (let i = 1; i <= 14; i++) {
    messages.push({
      role: i % 2 === 1 ? "user" : "assistant",
      content: i === 3
        ? "Мы спрятали древний свиток магии под каменным мостом у реки."
        : `Обычная реплика номер ${i} без особых тайн.`
    });
  }

  state.chats = { [chatId]: messages };
  state.chatMetadata = { [chatId]: {} };
  state.apiSettings = { ...(state.apiSettings || {}), maxHistoryMessages: 8 };

  // Candidate retrieval
  const candidates = getCandidateMemories(chatId, "свиток магии под мостом", 3);
  assert.ok(candidates.length > 0, "Should retrieve candidate containing matching tokens");
  assert.ok(candidates[0].text.includes("свиток магии"), "Candidate should be the message about the scroll");

  console.log("✔ Test 4 passed: buildRagIndex and getCandidateMemories successfully identify historical context.");
}

// -------------------------------------------------------------
// Test 5: Integration with PromptBuilder (<retrieved_memories>)
// -------------------------------------------------------------
{
  const mockChar = {
    id: "char_rag_test",
    name: "Элея",
    gender: "she/her",
    personality: "Мудрая эльфийка",
    scenario: "Путешествие в руины",
    systemPrompt: "Будь верной спутницей."
  };

  const customMemories = [
    {
      text: "User: Не забудь, что у меня аллергия на лунные цветы.",
      messageIndex: 10,
      jevRelevance: 0.95
    }
  ];

  const sysContext = buildSystemContext(
    mockChar,
    "Ты собрала те цветы?",
    null,
    null,
    null,
    "chat_test_pb",
    customMemories
  );

  assert.ok(sysContext.includes("<retrieved_memories>"), "System context must contain <retrieved_memories>");
  assert.ok(sysContext.includes("Релевантность: 95%"), "System context should include Jev relevance tag");
  assert.ok(sysContext.includes("аллергия на лунные цветы"), "System context should include memory content");

  console.log("✔ Test 5 passed: PromptBuilder correctly embeds Jev-ranked memories into system context.");
}

// -------------------------------------------------------------
// Test 6: RAG speakers, user+assistant pairs, window from maxHistoryMessages
// -------------------------------------------------------------
{
  const { getActivePersona } = await import("../services/storage.js");
  const userName = getActivePersona()?.userName || "User";
  const ownerId = "char_rag_owner";
  const chatId = "chat_rag_owner";
  clearRagIndex(chatId);

  state.characters = [{ id: ownerId, name: "Элея" }];
  state.chatMetadata = { [ownerId]: [{ id: chatId }], [chatId]: {} };
  state.apiSettings = { ...(state.apiSettings || {}), maxHistoryMessages: 4 };
  state.chats = {
    [chatId]: [
      { role: "user", content: "Где спрятан старый амулет тишины?" },
      { role: "assistant", content: "Он лежит в склепе под часовней, за ржавой решёткой." },
      { role: "user", content: "Кто его охраняет?" },
      { role: "assistant", content: "Призрак стражника, который ждёт пароль." },
      { role: "user", content: "Какой пароль?" },
      { role: "assistant", content: "Пароль — тень." }
    ]
  };

  const idx = buildRagIndex(chatId);
  assert.ok(idx, "Index must be built");
  const pairChunk = idx.chunks.find(c => c.messageIndex === 1);
  assert.ok(pairChunk, "First user message must be indexed as a pair chunk");
  assert.ok(pairChunk.text.includes(`${userName}: Где спрятан`), "User line must use the persona name");
  assert.ok(pairChunk.text.includes("Элея: Он лежит в склепе"), "Assistant line must use the owner character name");
  assert.ok(pairChunk.text.includes("\n"), "Pair chunk must contain both messages");
  assert.ok(!idx.chunks.some(c => c.text.includes("Какой пароль")), "Messages inside the raw window must not be indexed");

  const found = getCandidateMemories(chatId, "амулет тишины склеп", 3);
  assert.ok(found.length > 0 && found[0].text.includes("склепе"), "Old lore question must be retrieved");

  state.apiSettings.maxHistoryMessages = 0;
  state.chats[chatId] = [
    { role: "user", content: "Первая реплика про драконов" },
    { role: "assistant", content: "[CHARACTER: Ведущий]\nДраконы спят в горах." },
    { role: "user", content: "ещё" }
  ];
  assert.strictEqual(buildRagIndex(chatId), null, "maxHistoryMessages=0 sends whole chat as raw history, nothing to index");

  state.apiSettings.maxHistoryMessages = 1;
  const gmIdx = buildRagIndex(chatId);
  assert.ok(gmIdx && gmIdx.chunks.some(c => c.text.includes("Ведущий: Драконы")), "GM tag must become the speaker name");
  assert.ok(!gmIdx.chunks.some(c => c.text.includes("[CHARACTER:")), "GM tag must be stripped from text");

  console.log("✔ Test 6 passed: RAG uses real speaker names, pairs messages, and follows the raw history window.");
}

console.log("\n🚀 All TypeSafe AI Jev & RAG Memory Tests Passed Successfully!");
