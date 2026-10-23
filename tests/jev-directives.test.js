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
    querySelectorAll: () => [],
    createElement: () => ({
      appendChild: () => {},
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} },
      style: {}
    })
  };
}

const {
  checkDirectivesWithJev,
  OPENROUTER_SYSTEMONE_URL,
  DEFAULT_JEV_MODEL
} = await import("../services/jevService.js");

const { state } = await import("../js/state.js");
const { checkAndCompleteDirectives } = await import("../js/ui.js");

console.log("=== Running TypeSafe AI Jev Directives Detector Tests ===");

// -------------------------------------------------------------
// Test 1: Question formation and payload structure
// -------------------------------------------------------------
{
  let capturedBody = null;
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: DEFAULT_JEV_MODEL,
        answers: {
          dir_0: { type: "noul", noul: 0.93 },
          dir_1: { type: "noul", noul: 0.12 }
        }
      })
    };
  };

  const activeDirs = [
    { id: "dir_ale", text: "Предложить зайти в таверну выпить эля", active: true, mode: "auto" },
    { id: "dir_knife", text: "Достать и показать серебряный кинжал", active: true, mode: "auto" },
    { id: "dir_keep", text: "Всегда говорить тихо и вежливо", active: true, mode: "keep" } // should be skipped
  ];

  const completed = await checkDirectivesWithJev({
    apiKey: "sk-mock-key-123",
    userMessage: "Куда мы пойдем дальше?",
    characterResponse: "*Улыбается и указывает рукой на деревянную вывеску*\nВпереди таверна 'Хромой дракон'. Давай зайдем, погреемся у очага и выпьем по кружке доброго эля!",
    activeDirectives: activeDirs,
    threshold: 0.70
  });

  // Verify keep mode was excluded from Jev questions
  assert.strictEqual(Object.keys(capturedBody.questions).length, 2, "Should evaluate 2 directives (ignoring 'keep')");
  assert.ok(capturedBody.questions.dir_0, "dir_0 question should be present");
  assert.ok(capturedBody.questions.dir_1, "dir_1 question should be present");
  assert.strictEqual(capturedBody.questions.dir_2, undefined, "'keep' directive must not be questioned");

  // Verify detection results
  assert.strictEqual(completed.length, 1, "Only 1 directive should be completed");
  assert.strictEqual(completed[0].directive.id, "dir_ale", "dir_ale should be completed");
  assert.strictEqual(completed[0].confidence, 0.93, "Confidence should match");

  global.fetch = originalFetch;
  console.log("✔ Test 1 passed: checkDirectivesWithJev correctly forms parallel Noul questions and filters keep-mode.");
}

// -------------------------------------------------------------
// Test 2: Directive not completed when confidence is below threshold
// -------------------------------------------------------------
{
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: DEFAULT_JEV_MODEL,
      answers: {
        dir_0: { type: "noul", noul: 0.45 } // below 0.70
      }
    })
  });

  const activeDirs = [
    { id: "dir_secret", text: "Раскрыть тайну своего происхождения", active: true, mode: "auto" }
  ];

  const completed = await checkDirectivesWithJev({
    apiKey: "sk-mock-key",
    userMessage: "Расскажи о себе.",
    characterResponse: "Я родился далеко отсюда. Больше тебе знать не нужно.",
    activeDirectives: activeDirs,
    threshold: 0.70
  });

  assert.strictEqual(completed.length, 0, "No directive should complete when confidence is below threshold");

  global.fetch = originalFetch;
  console.log("✔ Test 2 passed: Low-confidence actions are not falsely marked as completed.");
}

// -------------------------------------------------------------
// Test 3: Multiple directives completed in single turn
// -------------------------------------------------------------
{
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: DEFAULT_JEV_MODEL,
      answers: {
        dir_0: { type: "noul", noul: 0.89 },
        dir_1: { type: "noul", noul: 0.95 }
      }
    })
  });

  const activeDirs = [
    { id: "dir_tea", text: "Предложить чашку чая", active: true, mode: "auto" },
    { id: "dir_blanket", text: "Укутать плечи собеседника теплым пледом", active: true, mode: "auto" }
  ];

  const completed = await checkDirectivesWithJev({
    apiKey: "sk-mock-key",
    userMessage: "Мне так холодно...",
    characterResponse: "*Заботливо набрасывает на твои плечи шерстяной плед и протягивает дымящуюся кружку*\nВыпей горячего чая с мятой, тебе сразу станет теплее.",
    activeDirectives: activeDirs,
    threshold: 0.70
  });

  assert.strictEqual(completed.length, 2, "Both directives should be recognized as completed");
  assert.strictEqual(completed[0].directive.id, "dir_tea");
  assert.strictEqual(completed[1].directive.id, "dir_blanket");

  global.fetch = originalFetch;
  console.log("✔ Test 3 passed: Multiple goals accomplished in one response are detected simultaneously.");
}

// -------------------------------------------------------------
// Test 4: Graceful handling of missing key / network errors
// -------------------------------------------------------------
{
  const activeDirs = [
    { id: "dir_test", text: "Сказать пароль", active: true, mode: "auto" }
  ];

  const emptyKeyRes = await checkDirectivesWithJev({
    apiKey: "",
    characterResponse: "Пароль 'Полночь'!",
    activeDirectives: activeDirs
  });
  assert.deepStrictEqual(emptyKeyRes, [], "Should safely return empty array if no API key");

  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("Network timeout"); };

  const networkErrRes = await checkDirectivesWithJev({
    apiKey: "sk-valid-key",
    characterResponse: "Пароль 'Полночь'!",
    activeDirectives: activeDirs
  });
  assert.deepStrictEqual(networkErrRes, [], "Should safely return empty array on network failure");

  global.fetch = originalFetch;
  console.log("✔ Test 4 passed: Graceful fallback on missing API key or network exceptions.");
}

console.log("\n🚀 All Jev Directives Detector Tests Passed Successfully!");
