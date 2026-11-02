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

const {
  getCoreStateStageDescription,
  shouldIncludePersonality,
  extractVoiceSample,
  detectQuestionEndingLoop,
  sanitizeAssistantHistoryForPrompt,
  buildApiMessages,
  buildSystemContext,
  getStabsEdhPrompt
} = await import("../services/promptBuilder.js");

const {
  calculateRelationshipStage,
  STAGE_THRESHOLDS,
  POSITIVE_RELATIONSHIP_KEYS
} = await import("../services/storage.js");

const { state } = await import("../js/state.js");

console.log("=== Running Roleplay Enhancements V2 Tests ===");

// 1. coreStates stage description across 6 ranges
{
  const mockScale = {
    key: "trust",
    displayName: "Доверие",
    stages: [
      "Стадия 0 (0-20): Холоден и подозрителен",
      "Стадия 1 (21-40): Осторожное наблюдение",
      "Стадия 2 (41-60): Спокойная нейтральность",
      "Стадия 3 (61-80): Дружелюбие и открытость",
      "Стадия 4 (81-95): Глубокая привязанность",
      "Стадия 5 (96-100): Безграничная преданность"
    ]
  };

  assert.strictEqual(getCoreStateStageDescription(mockScale, 0), "Стадия 0 (0-20): Холоден и подозрителен");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 20), "Стадия 0 (0-20): Холоден и подозрителен");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 21), "Стадия 1 (21-40): Осторожное наблюдение");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 40), "Стадия 1 (21-40): Осторожное наблюдение");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 41), "Стадия 2 (41-60): Спокойная нейтральность");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 60), "Стадия 2 (41-60): Спокойная нейтральность");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 61), "Стадия 3 (61-80): Дружелюбие и открытость");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 80), "Стадия 3 (61-80): Дружелюбие и открытость");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 81), "Стадия 4 (81-95): Глубокая привязанность");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 95), "Стадия 4 (81-95): Глубокая привязанность");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 96), "Стадия 5 (96-100): Безграничная преданность");
  assert.strictEqual(getCoreStateStageDescription(mockScale, 100), "Стадия 5 (96-100): Безграничная преданность");
  console.log("✔ Test 1 passed: getCoreStateStageDescription accurately maps all 6 ranges.");
}

// 2. calculateRelationshipStage auto-progression & manualRelationshipStage respect
{
  const coreStates = [
    { key: "affinity", defaultValue: 10 },
    { key: "trust", defaultValue: 20 },
    { key: "corruption", defaultValue: 90 } // Non-positive scale, should be ignored
  ];

  // Stranger (0-10)
  assert.strictEqual(calculateRelationshipStage({ affinity: 5, trust: 10 }, coreStates), "Stranger");
  // Acquaintance (11-25)
  assert.strictEqual(calculateRelationshipStage({ affinity: 20, trust: 20 }, coreStates), "Acquaintance");
  // Familiar (26-40)
  assert.strictEqual(calculateRelationshipStage({ affinity: 35, trust: 35 }, coreStates), "Familiar");
  // Friend (41-55)
  assert.strictEqual(calculateRelationshipStage({ affinity: 50, trust: 50 }, coreStates), "Friend");
  // Close Friend (56-70)
  assert.strictEqual(calculateRelationshipStage({ affinity: 65, trust: 65 }, coreStates), "Close Friend");
  // Intimate (71-85)
  assert.strictEqual(calculateRelationshipStage({ affinity: 80, trust: 80 }, coreStates), "Intimate");
  // Soulmate (86-100)
  assert.strictEqual(calculateRelationshipStage({ affinity: 98, trust: 98 }, coreStates), "Soulmate");

  // Respect manual override
  const manualStates = {
    relationshipStage: "Friend",
    manualRelationshipStage: true,
    affinity: 99,
    trust: 99
  };
  assert.strictEqual(calculateRelationshipStage(manualStates, coreStates), "Friend", "manualRelationshipStage MUST prevent recalculation");
  console.log("✔ Test 2 passed: calculateRelationshipStage correctly calculates stages and respects manual overrides.");
}

// 3. shouldIncludePersonality eliminates composite duplicates
{
  const mockChar = {
    appearance: "Высокая эльфийка с серебряными волосами.",
    behavior: "Сдержанная, гордая, скрытная.",
    backstory: "Изгнанница из древнего рода.",
    speech: "Говорит тихо, вежливо, на «вы»."
  };

  // Composite duplication
  const compositePersonality = `[Внешность]: Высокая эльфийка с серебряными волосами.
[Характер и поведение]: Сдержанная, гордая, скрытная.
[Предыстория]: Изгнанница из древнего рода.
[Стиль общения]: Говорит тихо, вежливо, на «вы».`;

  assert.strictEqual(
    shouldIncludePersonality(mockChar, compositePersonality, mockChar.behavior, mockChar.appearance, mockChar.backstory, mockChar.speech),
    false,
    "Composite personality matching dedicated fields must be suppressed"
  );

  // Unique personality
  const uniquePersonality = "Обожает сладкое, панически боится пауков и мечтает увидеть океан.";
  assert.strictEqual(
    shouldIncludePersonality(mockChar, uniquePersonality, mockChar.behavior, mockChar.appearance, mockChar.backstory, mockChar.speech),
    true,
    "Unique personality content must be preserved"
  );
  console.log("✔ Test 3 passed: shouldIncludePersonality suppresses duplicate composite blocks while preserving unique traits.");
}

// 4. sanitizeAssistantHistoryForPrompt preserves author em-dashes and fixes ellipses
{
  const inputProse = `— Привет, — *она улыбнулась — едва заметно, словно сомневаясь.* — Ты пришёл...
— Да. И я долго ждал.... но это не важно.`;

  const sanitized = sanitizeAssistantHistoryForPrompt(inputProse);

  // Leading dialogue dashes should be converted to quotes
  assert.ok(sanitized.includes('"Привет,'), "Leading dialogue dash should be converted to quote");
  // Asterisk em-dashes MUST be preserved!
  assert.ok(sanitized.includes("*она улыбнулась — едва заметно, словно сомневаясь.*"), "Em-dash inside asterisks must NOT be replaced with quotes");
  // 3-dot ellipsis preserved
  assert.ok(sanitized.includes("пришёл..."), "3-dot ellipsis must be preserved");
  // 4-dot ellipsis compressed to 3-dot
  assert.ok(!sanitized.includes("...."), "4+ dot ellipsis must be compressed");
  assert.ok(sanitized.includes("ждал..."), "Compressed ellipsis must be 3 dots");
  console.log("✔ Test 4 passed: sanitizeAssistantHistoryForPrompt preserves author em-dashes and literary ellipses.");
}

// 5. extractVoiceSample preserves compact voice when chat >= 8 & postHistoryInstructions injection
{
  const examples = `<START>
{{user}}: Привет, как дела?
{{char}}: *Смотрит с легким прищуром.* "А тебе действительно интересно, или это просто вежливость?"
<START>
{{user}}: Расскажи о себе.
{{char}}: *Усмехается.* "Тайны должны оставаться тайнами, разве нет?"`;

  const compact = extractVoiceSample(examples, 150);
  assert.ok(compact.length <= 150, "extractVoiceSample must truncate within limit");
  assert.ok(compact.includes("<START>"), "extractVoiceSample must preserve starting dialogue");

  // System reminder with Author's Note and coreStates in buildApiMessages
  const testChar = {
    id: "char_test_v2",
    name: "Алиса",
    postHistoryInstructions: "Никогда не выходи из роли. Используй старинные обороты речи.",
    coreStates: [
      {
        key: "trust",
        displayName: "Доверие",
        defaultValue: 50,
        stages: ["0-20", "21-40", "Спокойное доверие (41-60)", "61-80", "81-95", "96-100"]
      }
    ]
  };

  state.chats["chat_char_test_v2"] = [
    { role: "user", content: "Привет" },
    { role: "assistant", content: "Здравствуй." }
  ];
  state.chatStates["chat_char_test_v2"] = {
    trust: 55,
    relationshipStage: "Friend"
  };

  const msgs = buildApiMessages(testChar, "Как ты?", null, null, null, "chat_char_test_v2");
  const lastSys = msgs[msgs.length - 1];
  assert.ok(lastSys.content.includes("АВТОРСКИЙ СТИЛЬ И УКАЗАНИЯ КАРТОЧКИ (AUTHOR'S NOTE)"), "postHistoryInstructions must be injected into system reminder");
  assert.ok(lastSys.content.includes("Доверие: 55/100 (Спокойное доверие (41-60))"), "coreStates and stage description must be present in system reminder");
  console.log("✔ Test 5 passed: extractVoiceSample and postHistoryInstructions / coreStates injection work properly.");
}

// 6. detectQuestionEndingLoop detects repetitive question endings
{
  const questionLoopChat = [
    { role: "user", content: "Привет" },
    { role: "assistant", content: "*Улыбнулась.* Привет! Как твои дела?" },
    { role: "user", content: "Нормально" },
    { role: "assistant", content: "*Кивнула.* Рада это слышать! А чем занимался сегодня?" },
    { role: "user", content: "Гулял" },
    { role: "assistant", content: "*Посмотрела в окно.* Прекрасно! Погода была хорошей, правда?" }
  ];

  assert.strictEqual(detectQuestionEndingLoop(questionLoopChat), true, "3 consecutive assistant turns ending with '?' must be flagged");

  const normalChat = [
    { role: "user", content: "Привет" },
    { role: "assistant", content: "*Улыбнулась.* Привет! Как твои дела?" },
    { role: "user", content: "Нормально" },
    { role: "assistant", content: "*Кивнула и сделала глоток чая.* Рада это слышать." }
  ];

  assert.strictEqual(detectQuestionEndingLoop(normalChat), false, "Varied endings must NOT be flagged");
  console.log("✔ Test 6 passed: detectQuestionEndingLoop accurately detects question loops.");
}

// 7. Duo mode contains mutual awareness without puppeteering
{
  const char1 = { id: "char_1", name: "Рей" };
  const char2 = { id: "char_2", name: "Аска" };
  state.chats["chat_duo_test"] = [
    { role: "user", content: "Всем привет!" },
    { role: "assistant", characterId: "char_2", content: "*Фыркнула.* Опять ты опаздываешь, идиот Синдзи!" }
  ];

  const duoMsgs = buildApiMessages(char1, "Привет", null, char2, { duo_relationship: "rivals" }, "chat_duo_test");
  const sysRecent = duoMsgs.find(m => m.content && m.content.includes("RECENT CONTEXT: PARTNER'S LAST WORDS"));
  assert.ok(sysRecent, "Duo mode must provide recent context of partner's words");
  assert.ok(sysRecent.content.includes("You see and hear Аска"), "Character must be aware of partner's presence");
  assert.ok(sysRecent.content.includes("NEVER speak or act FOR Аска"), "Puppeteering partner must be strictly forbidden");
  console.log("✔ Test 7 passed: Duo mode promotes mutual awareness without puppeteering.");
}

// 8. Continue mode provides continuation directive
{
  const testChar = { id: "char_cont", name: "Елена" };
  state.chats["chat_cont"] = [
    { role: "user", content: "Расскажи сказку" },
    { role: "assistant", content: "В некотором царстве, в некотором государстве жил-был старый" }
  ];

  const contMsgs = buildApiMessages(testChar, "[Continue]", null, null, {}, "chat_cont", null, null, { isContinue: true });
  const contReminder = contMsgs[contMsgs.length - 1];
  assert.ok(contReminder.content.includes("РЕЖИМ ПРОДОЛЖЕНИЯ ТЕКСТА (CONTINUE)"), "Continue mode must inject continuation directive");
  assert.ok(contReminder.content.includes("Ты продолжаешь свой предыдущий незаконченный ответ"), "Directive must instruct to continue seamlessly without greeting or restarting");
  console.log("✔ Test 8 passed: Continue mode produces continuation directives properly.");
}

console.log("\n🎉 ALL ROLEPLAY ENHANCEMENT V2 TESTS PASSED SUCCESSFULLY! 🎉");
