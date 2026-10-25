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

const { getStabsEdhPrompt, buildApiMessages, detectAndChainLoop } = await import("../services/promptBuilder.js");
const { state } = await import("../js/state.js");

console.log("=== Running Anti \"And-Chain\" (Цепочки «И») Tests ===");

// 1. Static ban present in all STAB'S EDH variants
{
  const ruSolo = getStabsEdhPrompt(true, "Hero", false);
  const ruGm = getStabsEdhPrompt(true, "Hero", true);
  const enSolo = getStabsEdhPrompt(false, "Hero", false);
  const enGm = getStabsEdhPrompt(false, "Hero", true);

  assert.ok(ruSolo.includes("ЗАПРЕТ ЦЕПОЧЕК «И»"), "RU Solo must ban 'И' chains");
  assert.ok(ruGm.includes("ЗАПРЕТ ЦЕПОЧЕК «И»"), "RU GM must ban 'И' chains");
  assert.ok(enSolo.includes('NO "AND"-CHAINS'), "EN Solo must ban 'And' chains");
  assert.ok(enGm.includes('NO "AND"-CHAINS'), "EN GM must ban 'And' chains");
  console.log("✔ Test 1 passed: All STAB'S EDH variants explicitly ban 'И/And' chains.");
}

// 2. detectAndChainLoop ignores normal prose
{
  const healthy = [
    { role: "user", content: "Привет!" },
    { role: "assistant", content: "*Он поднял взгляд от книги.* Привет. Не ожидал тебя здесь увидеть, честно говоря." },
    { role: "user", content: "Что читаешь?" },
    { role: "assistant", content: "Детектив, вроде того. — *Он захлопнул книгу и отложил её в сторону.* Сюжет банальный, но язык живой. Садись, если хочешь, расскажу." }
  ];
  assert.strictEqual(detectAndChainLoop(healthy), false, "Healthy varied prose must NOT be flagged");
  console.log("✔ Test 2 passed: Normal prose is not flagged.");
}

// 3. detectAndChainLoop catches the user's exact reported pattern
{
  const looped = [
    { role: "user", content: "Иди сюда" },
    { role: "assistant", content: "И я встал с дивана, и пошел на кухню, и взял там еду, и подумал что так и надо." },
    { role: "user", content: "Окей" },
    { role: "assistant", content: "И я сел за стол, и открыл коробку, и начал есть, и посмотрел в окно. И стало тихо." },
    { role: "user", content: "И дальше?" },
    { role: "assistant", content: "*Он пожал плечами и отвернулся.* Ничего особенного. Дождь за окном усилился, стёкла запотели." }
  ];
  assert.strictEqual(detectAndChainLoop(looped), true, "The reported 'И...' loop pattern MUST be flagged");
  console.log("✔ Test 3 passed: The reported 'И...' loop pattern is detected.");
}

// 4. Single slipping message is tolerated (no false alarm on one-off)
{
  const oneOff = [
    { role: "user", content: "Расскажи" },
    { role: "assistant", content: "И я встал с дивана, и пошел на кухню, и взял там еду, и подумал что так и надо." },
    { role: "user", content: "Хм" },
    { role: "assistant", content: "Впрочем, еда оказалась пресной. — *Он бросил корку обратно в миску.* Расскажи лучше, как у тебя дела." }
  ];
  assert.strictEqual(detectAndChainLoop(oneOff), false, "A single slipping message must NOT trigger the alarm");
  console.log("✔ Test 4 passed: One-off slip does not trigger the correction.");
}

// 5. buildApiMessages injects corrective reminder when loop is detected (Solo, RU)
{
  const dummyChar = {
    id: "test-char-loop",
    name: "Мира",
    gender: "she/her",
    description: "Тестовый персонаж"
  };

  state.activeCharacterId = dummyChar.id;
  state.sidebarTab = "characters";
  state.characters = [dummyChar];
  state.chatMetadata = { [dummyChar.id]: { type: "single" } };
  state.chats = {
    [dummyChar.id]: [
      { role: "assistant", content: "И я встал с дивана, и пошел на кухню, и взял там еду, и подумал что так и надо.", timestamp: 1 },
      { role: "user", content: "И что было дальше?", timestamp: 2 },
      { role: "assistant", content: "И я сел за стол, и открыл коробку, и начал есть, и посмотрел в окно. И стало тихо.", timestamp: 3 }
    ]
  };
  state.apiSettings = { chatLanguage: "ru", stabsEdhEnabled: true, initiativeLevel: "balanced" };

  const msgs = buildApiMessages(dummyChar, "Продолжай", null, null, null, dummyChar.id);
  const reminder = msgs[msgs.length - 1].content;
  assert.ok(reminder.includes("КРИТИЧЕСКИЙ СБОЙ СТИЛЯ"), "Corrective style-failure reminder must be injected");
  assert.ok(reminder.includes("ЦЕПОЧКИ «И»"), "Reminder must name the 'И' chain problem");
  console.log("✔ Test 5 passed: buildApiMessages injects the corrective reminder when the loop is detected.");
}

// 6. No corrective reminder for healthy history (Solo, RU)
{
  state.chats = {
    "test-char-loop": [
      { role: "assistant", content: "*Она кивнула и улыбнулась.* Рада тебя видеть!", timestamp: 1 },
      { role: "user", content: "Взаимно", timestamp: 2 },
      { role: "assistant", content: "Проходи. — *Она отступила в сторону, пропуская гостя.* Чай только вскипел, как раз кстати.", timestamp: 3 }
    ]
  };
  const msgs = buildApiMessages(state.characters[0], "Спасибо", null, null, null, "test-char-loop");
  const reminder = msgs[msgs.length - 1].content;
  assert.ok(!reminder.includes("КРИТИЧЕСКИЙ СБОЙ СТИЛЯ"), "No corrective reminder for healthy history");
  console.log("✔ Test 6 passed: Healthy history gets no corrective reminder.");
}

// 7. English loop detection (sentence-initial "And")
{
  const enLooped = [
    { role: "assistant", content: "And I got up. And I walked to the door. And I opened it slowly." },
    { role: "user", content: "Go on" },
    { role: "assistant", content: "And he smiled, and he waved, and he turned around, and he left the room." }
  ];
  assert.strictEqual(detectAndChainLoop(enLooped), true, "English 'And' loop MUST be flagged");
  console.log("✔ Test 7 passed: English 'And' loop is detected.");
}

console.log("\n🚀 All Anti \"And-Chain\" Tests Passed Successfully!\n");
