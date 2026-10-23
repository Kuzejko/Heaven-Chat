import assert from 'assert';

// Mock localStorage
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] || null
};

// Mock DOM
const mockNode = {
  style: {},
  classList: { add: () => {}, remove: () => {}, contains: () => false },
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => mockNode,
  querySelectorAll: () => [],
  appendChild: () => {},
  removeChild: () => {},
  click: () => {},
  remove: () => {},
  value: '',
  textContent: '',
  innerHTML: ''
};

global.document = {
  createElement: (tag) => ({ ...mockNode }),
  getElementById: () => mockNode,
  querySelector: () => mockNode,
  querySelectorAll: () => [],
  body: mockNode
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
  getComputedStyle: () => ({ display: 'block' })
};

global.CustomEvent = class CustomEvent {
  constructor(name, opts) {
    this.name = name;
    this.detail = opts?.detail;
  }
};

// Imports
const {
  createPersonaDataFromCharacter,
  loadPersonas,
  savePersonas,
  getActivePersonaId,
  setActivePersonaId,
  getActivePersona
} = await import("../services/storage.js");

const {
  adoptCharacterAsPersona
} = await import("../js/ui.js");

const { state } = await import("../js/state.js");

console.log("=== Running Persona From Character Tests ===");

// 1. Test createPersonaDataFromCharacter
{
  const character = {
    id: "char_999",
    name: "Элеонора",
    gender: "she/her",
    description: "Холодная эльфийская чародейка.",
    appearance: "Длинные серебряные волосы, ледяные синие глаза, элегантная мантия.",
    behavior: "Сдержанная, язвительная, но преданная тем, кого уважает.",
    speech: "Говорит спокойно, четко, часто использует сарказм.",
    backstory: "Бывшая верховная волшебница королевской академии.",
    avatarUrl: "data:image/png;base64,mockavatar"
  };

  const personaData = createPersonaDataFromCharacter(character);
  assert.strictEqual(personaData.name, "Элеонора");
  assert.strictEqual(personaData.userName, "Элеонора");
  assert.strictEqual(personaData.userPronouns, "she/her");
  assert.strictEqual(personaData.avatarUrl, "data:image/png;base64,mockavatar");
  assert.ok(personaData.description.includes("Холодная эльфийская чародейка."));
  assert.ok(personaData.description.includes("[Внешность]: Длинные серебряные волосы"));
  assert.ok(personaData.description.includes("[Характер и поведение]: Сдержанная"));
  assert.ok(personaData.description.includes("[Предыстория]: Бывшая верховная"));
  assert.ok(personaData.description.includes("[Стиль общения]: Говорит спокойно"));
  console.log("✔ Test 1 passed: createPersonaDataFromCharacter properly compiles character data into persona.");
}

// 2. Test adoptCharacterAsPersona
{
  const warrior = {
    id: "char_warrior",
    name: "Рагнар",
    gender: "he/him",
    description: "Северный воин",
    appearance: "Шрамы на лице, медвежья шкура.",
    behavior: "Грубый, честный, храбрый.",
    avatarUrl: "https://example.com/ragnar.png"
  };

  const adopted = adoptCharacterAsPersona(warrior, true);
  assert.strictEqual(adopted.name, "Рагнар");
  assert.strictEqual(getActivePersonaId(), adopted.id);

  const active = getActivePersona();
  assert.strictEqual(active.name, "Рагнар");
  assert.strictEqual(active.userName, "Рагнар");
  assert.strictEqual(active.userPronouns, "he/him");
  assert.strictEqual(active.avatarUrl, "https://example.com/ragnar.png");
  assert.strictEqual(state.apiSettings.userName, "Рагнар");
  assert.strictEqual(state.apiSettings.userPronouns, "he/him");
  console.log("✔ Test 2 passed: adoptCharacterAsPersona persists persona and sets it active.");
}

// 3. Test updating existing adopted persona
{
  const warriorUpdated = {
    id: "char_warrior",
    name: "Рагнар",
    gender: "he/him",
    description: "Конунг Северных земель",
    appearance: "Золотая корона поверх медвежьей шкуры.",
    behavior: "Мудрый и грозный правитель.",
    avatarUrl: "https://example.com/ragnar_king.png"
  };

  adoptCharacterAsPersona(warriorUpdated, true);
  const personas = loadPersonas();
  const ragnars = personas.filter(p => p.name === "Рагнар");
  assert.strictEqual(ragnars.length, 1, "Should update existing persona instead of duplicating");
  assert.strictEqual(ragnars[0].avatarUrl, "https://example.com/ragnar_king.png");
  assert.ok(ragnars[0].description.includes("Конунг Северных земель"));
  console.log("✔ Test 3 passed: adoptCharacterAsPersona cleanly updates existing persona.");
}

console.log("\n🚀 All Persona From Character Tests Passed Successfully!");
