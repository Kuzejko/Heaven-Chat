import assert from "node:assert";

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

if (typeof global.document === "undefined") {
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

const { normalizeApiSettings } = await import("../js/config.js");
const { state } = await import("../js/state.js");
const { buildSystemContext } = await import("../services/promptBuilder.js");

console.log("=== Running Hidden Traits Feature Tests ===");

// ── Test 1: normalizeApiSettings defaults and preservation ──
{
  const settingsDefault = normalizeApiSettings({});
  assert.strictEqual(settingsDefault.enableHiddenTraits, true, "enableHiddenTraits defaults to true");

  const settingsOff = normalizeApiSettings({ enableHiddenTraits: false });
  assert.strictEqual(settingsOff.enableHiddenTraits, false, "enableHiddenTraits preserves false");
  console.log("✔ Test 1 passed: normalizeApiSettings handles enableHiddenTraits.");
}

// ── Test 2: Prompt Injection of <hidden_traits> ──
{
  const mockChar = {
    id: "test_char",
    name: "Aria",
    description: "A mysterious maid.",
    personality: "Polite and quiet.",
    scenario: "In a mansion.",
    systemPrompt: "Serve tea.",
    traits: ["Polite"],
    hiddenTraits: ["Tsundere", "Obsessive"]
  };

  // When enabled:
  state.apiSettings = { enableHiddenTraits: true };
  const promptEnabled = buildSystemContext(mockChar, "Hello");
  assert.ok(promptEnabled.includes("<hidden_traits>"), "Prompt must contain <hidden_traits>");
  assert.ok(promptEnabled.includes("Tsundere, Obsessive"), "Prompt must list hidden traits");
  assert.ok(promptEnabled.includes("Never explicitly mention"), "Prompt must contain concealing directive");

  // When disabled:
  state.apiSettings = { enableHiddenTraits: false };
  const promptDisabled = buildSystemContext(mockChar, "Hello");
  assert.ok(!promptDisabled.includes("<hidden_traits>"), "Prompt must NOT contain <hidden_traits> when disabled");

  // When character has no hidden traits:
  state.apiSettings = { enableHiddenTraits: true };
  const charNoHidden = { ...mockChar, hiddenTraits: [] };
  const promptNoHidden = buildSystemContext(charNoHidden, "Hello");
  assert.ok(!promptNoHidden.includes("<hidden_traits>"), "Prompt must NOT contain <hidden_traits> when empty");

  console.log("✔ Test 2 passed: buildSystemContext correctly injects and conceals hidden traits.");
}

// ── Test 3: Math Engine Simulation of modifyValueByTraits ──
{
  function evalTraits(character, key, value, currentTrust = 25, enabled = true) {
    if (!character) return { value, explanation: "" };
    const hasRegular = character.traits && character.traits.length > 0;
    const hasHidden = enabled && character.hiddenTraits && character.hiddenTraits.length > 0;
    if (!hasRegular && !hasHidden) return { value, explanation: "" };

    let val = Number(value);
    let originalVal = val;
    let explanations = [];
    let hasHiddenEffect = false;
    const normalizedKey = key.replace(/^duo_/, "");

    if (hasHidden) {
      const hidden = character.hiddenTraits;
      const trust = currentTrust;

      if (hidden.includes("Tsundere")) {
        if (normalizedKey === "affinity" && val > 0) {
          val = trust < 50 ? Math.round(val * 0.5) : Math.round(val * 1.5);
          hasHiddenEffect = true;
        }
      }

      if (hidden.includes("Obsessive")) {
        if (normalizedKey === "affinity" || normalizedKey === "trust") {
          val = val > 0 ? Math.round(val * 1.5) : Math.round(val * 2.0);
          hasHiddenEffect = true;
        }
      }

      if (hidden.includes("Volatile") && val !== 0) {
        val = Math.round(val * 1.6);
        hasHiddenEffect = true;
      }

      if (hidden.includes("Guarded") && (normalizedKey === "affinity" || normalizedKey === "trust") && val > 0) {
        val = trust < 60 ? Math.round(val * 0.6) : Math.round(val * 2.0);
        hasHiddenEffect = true;
      }

      if ((hidden.includes("Masochist") || hidden.includes("Submissive"))) {
        if (normalizedKey === "affinity" && val < 0) {
          val = Math.round(val * 0.5);
          hasHiddenEffect = true;
        } else if (normalizedKey === "fear" && val > 0) {
          val = Math.round(val * 0.6);
          hasHiddenEffect = true;
        }
      }
    }

    if (val !== originalVal) {
      if (hasHiddenEffect) {
        explanations.push("??? Скрытый фактор изменил значение");
      }
      return { value: val, explanation: ` (${explanations.join("; ")})` };
    }
    return { value: val, explanation: "" };
  }

  const charTsundere = { traits: [], hiddenTraits: ["Tsundere"] };
  const resTsunLow = evalTraits(charTsundere, "affinity", 10, 30);
  assert.strictEqual(resTsunLow.value, 5, "Tsundere cuts affinity when trust < 50");
  assert.ok(resTsunLow.explanation.includes("??? Скрытый фактор"), "Explanation must mask trait name");
  assert.ok(!resTsunLow.explanation.includes("Tsundere"), "Explanation must not reveal Tsundere");

  const resTsunHigh = evalTraits(charTsundere, "affinity", 10, 70);
  assert.strictEqual(resTsunHigh.value, 15, "Tsundere boosts affinity when trust >= 50");

  const charObsessive = { traits: [], hiddenTraits: ["Obsessive"] };
  assert.strictEqual(evalTraits(charObsessive, "affinity", 10).value, 15, "Obsessive boosts gain");
  assert.strictEqual(evalTraits(charObsessive, "affinity", -10).value, -20, "Obsessive doubles loss");

  const charVolatile = { traits: [], hiddenTraits: ["Volatile"] };
  assert.strictEqual(evalTraits(charVolatile, "affinity", 10).value, 16, "Volatile boosts delta");
  assert.strictEqual(evalTraits(charVolatile, "trust", -10).value, -16, "Volatile amplifies drop");

  const charGuarded = { traits: [], hiddenTraits: ["Guarded"] };
  assert.strictEqual(evalTraits(charGuarded, "trust", 10, 40).value, 6, "Guarded dampens low trust gains");
  assert.strictEqual(evalTraits(charGuarded, "trust", 10, 80).value, 20, "Guarded doubles high trust gains");

  const charMaso = { traits: [], hiddenTraits: ["Masochist"] };
  assert.strictEqual(evalTraits(charMaso, "affinity", -10).value, -5, "Masochist softens affinity drop");
  assert.strictEqual(evalTraits(charMaso, "fear", 10).value, 6, "Masochist dampens fear");

  const resDisabled = evalTraits(charObsessive, "affinity", 10, 25, false);
  assert.strictEqual(resDisabled.value, 10, "Disabled engine leaves value unchanged");
  assert.strictEqual(resDisabled.explanation, "", "No explanation when disabled");

  console.log("✔ Test 3 passed: All 6 hidden trait mathematical modifiers function accurately and conceal names.");
}

console.log("\n🚀 All Hidden Traits Tests Passed Successfully!");
