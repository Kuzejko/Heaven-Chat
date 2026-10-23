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

// Base mock DOM node
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
  getComputedStyle: () => ({ display: 'block' })
};

// Import card import service
const {
  decodeBase64ToUtf8,
  normalizeCharacterCardJson,
  extractCardDataFromPng
} = await import("../services/cardImportService.js");

console.log("=== Running Card Import Service Tests ===");

// 1. Test decodeBase64ToUtf8 with UTF-8 unicode characters
{
  const original = JSON.stringify({ name: "Элеонора", description: "Холодная эльфийка 🧝‍♀️" });
  const base64 = Buffer.from(original, "utf-8").toString("base64");
  const decoded = decodeBase64ToUtf8(base64);
  const parsed = JSON.parse(decoded);
  assert.strictEqual(parsed.name, "Элеонора");
  assert.strictEqual(parsed.description, "Холодная эльфийка 🧝‍♀️");
  console.log("✔ Test 1 passed: Base64 to UTF-8 decoding handles Unicode properly.");
}

// 2. Test normalizeCharacterCardJson with Character Card V2 spec (Chub standard)
{
  const v2Card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Seraphina",
      description: "A mysterious celestial guardian.",
      personality: "[Appearance: Silver hair, glowing blue eyes] [Traits: Loyal, Stoic]",
      scenario: "You meet Seraphina in an ancient ruin.",
      first_mes: "*Seraphina lowers her celestial blade.* \"State your purpose, mortal.\"",
      mes_example: "<START>\n{{user}}: Who are you?\n{{char}}: *Looks away* \"I am Seraphina.\"",
      system_prompt: "Roleplay as Seraphina. Stay in character.",
      alternate_greetings: [
        "*Seraphina glances at you from the shadows.* \"You shouldn't be here.\""
      ],
      tags: ["Celestial", "Guardian", "Stoic"],
      character_book: {
        name: "Celestial Lore",
        entries: [
          {
            keys: ["celestial blade", "sword"],
            content: "A holy sword crafted from starlight.",
            enabled: true
          }
        ]
      }
    }
  };

  const normalized = normalizeCharacterCardJson(v2Card, "data:image/png;base64,mockavatar");
  assert.strictEqual(normalized.name, "Seraphina");
  assert.strictEqual(normalized.description, "A mysterious celestial guardian.");
  assert.strictEqual(normalized.firstMessage, "*Seraphina lowers her celestial blade.* \"State your purpose, mortal.\"");
  assert.strictEqual(normalized.formatVersion, "v2");
  assert.strictEqual(normalized.avatarUrl, "data:image/png;base64,mockavatar");
  assert.strictEqual(normalized.lorebook.length, 1);
  assert.strictEqual(normalized.lorebook[0].keys, "celestial blade, sword");
  assert.strictEqual(normalized.lorebook[0].content, "A holy sword crafted from starlight.");
  assert.strictEqual(normalized.alternateGreetings.length, 1);
  assert.deepStrictEqual(normalized.tags, ["Celestial", "Guardian", "Stoic"]);
  console.log("✔ Test 2 passed: Character Card V2 normalized successfully.");
}

// 3. Test normalizeCharacterCardJson with Character Card V1 / Tavern / Chub Definition spec
{
  const chubDefCard = {
    definition: {
      name: "Alucard",
      description: "Vampire Lord",
      personality: "Dark, brooding, powerful",
      scenario: "In the castle throne room",
      first_mes: "*Alucard sits upon his throne.* \"What brings you here?\""
    }
  };

  const normalized = normalizeCharacterCardJson(chubDefCard);
  assert.strictEqual(normalized.name, "Alucard");
  assert.strictEqual(normalized.formatVersion, "chub_definition");
  assert.strictEqual(normalized.scenario, "In the castle throne room");
  assert.strictEqual(normalized.firstMessage, "*Alucard sits upon his throne.* \"What brings you here?\"");
  console.log("✔ Test 3 passed: Chub Definition normalized successfully.");
}

// 4. Test PNG extraction with tEXt chunk
{
  const cardPayload = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Kaelen",
      description: "Rogue shadow assassin",
      first_mes: "*Steps out of the shadows.* \"Need something done?\""
    }
  };

  const jsonStr = JSON.stringify(cardPayload);
  const base64Data = Buffer.from(jsonStr, "utf-8").toString("base64");

  // PNG signature (8 bytes)
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const ihdrChunk = createPngChunk("IHDR", ihdrData);

  // tEXt chunk with keyword "chara\0<base64>"
  const keyword = "chara";
  const textPayload = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]), // null separator
    Buffer.from(base64Data, "latin1")
  ]);
  const textChunk = createPngChunk("tEXt", textPayload);

  // IEND chunk
  const iendChunk = createPngChunk("IEND", Buffer.alloc(0));

  const pngBuffer = Buffer.concat([signature, ihdrChunk, textChunk, iendChunk]);

  // Convert Node Buffer to ArrayBuffer
  const uint8 = new Uint8Array(pngBuffer);
  const extracted = await extractCardDataFromPng(uint8.buffer);
  assert.strictEqual(extracted.spec, "chara_card_v2");
  assert.strictEqual(extracted.data.name, "Kaelen");
  assert.strictEqual(extracted.data.first_mes, "*Steps out of the shadows.* \"Need something done?\"");
  console.log("✔ Test 4 passed: PNG metadata extraction (tEXt chara chunk) verified.");
}

function createPngChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  // Dummy CRC
  buf.writeUInt32BE(0, 8 + len);
  return buf;
}

console.log("\n🚀 All Card Import Service Tests Passed Successfully!");
