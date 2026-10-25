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

const { STAGE_THRESHOLDS, getStageBehavior, loadApiSettings } = await import("../services/storage.js");
const { getStabsEdhPrompt, buildApiMessages } = await import("../services/promptBuilder.js");
const { state } = await import("../js/state.js");

console.log("=== Running Character Initiative & Agency Tests ===");

// 1. Verify STAGE_THRESHOLDS has no "No initiative" blocker
{
  const stranger = STAGE_THRESHOLDS.find(s => s.stage === "Stranger");
  assert.ok(stranger, "Stranger stage must exist");
  assert.ok(!stranger.behavior.includes("No initiative"), "Stranger stage must NOT contain 'No initiative'");
  assert.ok(stranger.behavior.includes("boundaries") || stranger.behavior.includes("clarifying questions"), "Stranger stage should have active, boundaried behavior");

  const behavior = getStageBehavior("Stranger");
  assert.ok(!behavior.includes("No initiative"), "getStageBehavior('Stranger') must not include 'No initiative'");
  console.log("✔ Test 1 passed: STAGE_THRESHOLDS does not suppress initiative on Stranger stage.");
}

// 2. Verify loadApiSettings default initiativeLevel
{
  const settings = loadApiSettings();
  assert.strictEqual(settings.initiativeLevel, "balanced", "Default initiativeLevel should be 'balanced'");
  console.log("✔ Test 2 passed: loadApiSettings provides initiativeLevel: 'balanced' by default.");
}

// 3. Verify getStabsEdhPrompt incorporates ACTION, DRIVE & PASS
{
  const ruSolo = getStabsEdhPrompt(true, "Hero", false);
  assert.ok(ruSolo.includes("ACTION, DRIVE & PASS"), "Russian Solo STAB'S EDH should include ACTION, DRIVE & PASS");
  assert.ok(ruSolo.includes("прояви инициативу"), "Russian Solo STAB'S EDH should encourage initiative");
  assert.ok(!ruSolo.includes("опиши свою реакцию и ОСТАНОВИСЬ, передав ход"), "Passive stop-and-pass must be removed");

  const ruGm = getStabsEdhPrompt(true, "Hero", true);
  assert.ok(ruGm.includes("ACTION, DRIVE & PASS"), "Russian GM STAB'S EDH should include ACTION, DRIVE & PASS");
  assert.ok(ruGm.includes("двигай сцену вперед"), "Russian GM STAB'S EDH should advance the scene");

  const enSolo = getStabsEdhPrompt(false, "Hero", false);
  assert.ok(enSolo.includes("ACTION, DRIVE & PASS"), "English Solo STAB'S EDH should include ACTION, DRIVE & PASS");
  assert.ok(enSolo.includes("TAKE THE INITIATIVE"), "English Solo STAB'S EDH should include TAKE THE INITIATIVE");

  const enGm = getStabsEdhPrompt(false, "Hero", true);
  assert.ok(enGm.includes("ACTION, DRIVE & PASS"), "English GM STAB'S EDH should include ACTION, DRIVE & PASS");
  console.log("✔ Test 3 passed: getStabsEdhPrompt mandates proactive action across Solo/GM in Russian and English.");
}

// 4. Verify buildApiMessages injects initiative levels
{
  const dummyChar = {
    id: "test-char-1",
    name: "Алиса",
    gender: "she/her",
    description: "Тестовый персонаж",
    personality: "Решительная",
    speech: "Живая речь",
    behavior: "Активная",
    scenario: "Встреча в таверне"
  };

  state.activeCharacterId = dummyChar.id;
  state.characters = [dummyChar];
  state.chats = { [dummyChar.id]: [] };
  state.chatMetadata = { [dummyChar.id]: { type: "single" } };

  // 4a. High Initiative Level
  state.apiSettings = {
    chatLanguage: "ru",
    stabsEdhEnabled: true,
    initiativeLevel: "high"
  };
  const highMsgs = buildApiMessages(dummyChar, "Привет!", null, null, null, dummyChar.id);
  const highReminder = highMsgs[highMsgs.length - 1].content;
  assert.ok(highReminder.includes("ВЫСОКИЙ УРОВЕНЬ ИНИЦИАТИВЫ"), "High initiative prompt must be injected");
  assert.ok(highReminder.includes("активный лидер"), "High initiative prompt should mention leading the scene");

  // 4b. Balanced Initiative Level
  state.apiSettings.initiativeLevel = "balanced";
  const balMsgs = buildApiMessages(dummyChar, "Привет!", null, null, null, dummyChar.id);
  const balReminder = balMsgs[balMsgs.length - 1].content;
  assert.ok(balReminder.includes("СБАЛАНСИРОВАННАЯ ИНИЦИАТИВА"), "Balanced initiative prompt must be injected");

  // 4c. Follower Initiative Level
  state.apiSettings.initiativeLevel = "follower";
  const folMsgs = buildApiMessages(dummyChar, "Привет!", null, null, null, dummyChar.id);
  const folReminder = folMsgs[folMsgs.length - 1].content;
  assert.ok(folReminder.includes("СПОКОЙНАЯ ИНИЦИАТИВА"), "Follower initiative prompt must be injected");

  console.log("✔ Test 4 passed: buildApiMessages correctly injects directives for all initiative levels.");
}

// 5. Verify Character Turn trigger prompt injection
{
  const dummyChar = {
    id: "test-char-2",
    name: "Рей",
    gender: "he/him"
  };
  state.activeCharacterId = dummyChar.id;
  state.characters = [dummyChar];
  state.chats = { [dummyChar.id]: [] };
  state.chatMetadata = { [dummyChar.id]: { type: "single" } };
  state.apiSettings = {
    chatLanguage: "ru",
    stabsEdhEnabled: true,
    initiativeLevel: "balanced"
  };

  // Test with turn transfer phrase
  const turnMsgs = buildApiMessages(dummyChar, "*выдерживает паузу, передавая инициативу персонажу*", null, null, null, dummyChar.id);
  const turnReminder = turnMsgs[turnMsgs.length - 1].content;
  assert.ok(turnReminder.includes("ХОД ПЕРСОНАЖА (САМОСТОЯТЕЛЬНОЕ ДЕЙСТВИЕ)"), "Character turn prompt must be triggered by turn phrase");
  assert.ok(turnReminder.includes("Сделай самостоятельный шаг"), "Character turn prompt should command autonomous action");

  // Test with empty input
  const emptyMsgs = buildApiMessages(dummyChar, "", null, null, null, dummyChar.id);
  const emptyReminder = emptyMsgs[emptyMsgs.length - 1].content;
  assert.ok(emptyReminder.includes("ХОД ПЕРСОНАЖА (САМОСТОЯТЕЛЬНОЕ ДЕЙСТВИЕ)"), "Character turn prompt must be triggered by empty input");

  console.log("✔ Test 5 passed: Character Turn trigger commands autonomous action for empty/turn inputs.");
}

console.log("\n🚀 All Character Initiative & Agency Tests Passed Successfully!\n");
