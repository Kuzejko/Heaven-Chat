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

const { state } = await import("../js/state.js");
const { buildSystemContext, buildApiMessages, buildGroupScenePrompt } = await import("../services/promptBuilder.js");

console.log("=== Running Global System Prompt Priority Tests ===");

const mockCharacter = {
  id: "test_hero",
  name: "Эри",
  gender: "she/her",
  description: "Отважная волшебница",
  personality: "Добрая и смелая",
  systemPrompt: "Всегда говори стихами."
};

state.characters = [mockCharacter];
state.activeCharacterId = mockCharacter.id;
state.chats = {
  [mockCharacter.id]: []
};
state.apiSettings = {
  chatLanguage: "ru"
};

// Test 1: buildSystemContext puts global_system_prompt at the VERY BEGINNING with priority="supreme"
{
  state.globalSystemPrompt = "СТРОГОЕ ПРАВИЛО: Всегда отвечай только на русском языке и используй звездочки.";
  const context = buildSystemContext(mockCharacter);
  
  assert.ok(context.includes("<global_system_prompt priority=\"supreme\">"), "Must include global_system_prompt with priority=\"supreme\"");
  assert.ok(context.includes("🚨 ВЫСШИЙ СИСТЕМНЫЙ ПРИОРИТЕТ — ГЛОБАЛЬНЫЕ ПРАВИЛА ИЗ НАСТРОЕК:"), "Must include supreme header");
  assert.ok(context.includes("СТРОГОЕ ПРАВИЛО: Всегда отвечай только на русском языке"), "Must contain prompt body");

  const globalIndex = context.indexOf("<global_system_prompt");
  const charInfoIndex = context.indexOf("<character_info>");
  assert.ok(globalIndex !== -1 && globalIndex < charInfoIndex, "global_system_prompt must come BEFORE character_info at the top of context");
  
  console.log("✔ Test 1 passed: buildSystemContext places global_system_prompt at the top of context with supreme priority.");
}

// Test 2: character_system_prompt is subordinated to global_system_prompt
{
  const context = buildSystemContext(mockCharacter);
  assert.ok(context.includes("<character_system_prompt>"), "Must include character_system_prompt");
  assert.ok(context.includes("В случае любого противоречия с глобальными правилами из настроек (<global_system_prompt>) безусловный приоритет всегда имеют глобальные правила."), "Character prompt must declare subordination to global prompt");
  
  console.log("✔ Test 2 passed: character_system_prompt declares subordination to global_system_prompt.");
}

// Test 3: buildApiMessages injects global prompt reminder into final <system_reminder>
{
  state.globalSystemPrompt = "Всегда оставайся в роли и никогда не выходи из неё.";
  const messages = buildApiMessages(mockCharacter, "Привет!", null, null, {}, mockCharacter.id);
  const finalSys = messages[messages.length - 1];
  
  assert.strictEqual(finalSys.role, "system", "Last message must be system reminder");
  assert.ok(finalSys.content.includes("👑 НАПОМИНАНИЕ: ГЛОБАЛЬНЫЕ ПРАВИЛА ИЗ НАСТРОЕК (ВЫСШИЙ ПРИОРИТЕТ):"), "system_reminder must include global prompt reminder");
  assert.ok(finalSys.content.includes("Всегда оставайся в роли и никогда не выходи из неё."), "system_reminder must contain active global prompt content");
  
  console.log("✔ Test 3 passed: buildApiMessages injects supreme reminder of global prompt into final system_reminder.");
}

// Test 4: GM Mode buildGroupScenePrompt places global_system_prompt at top
{
  state.sidebarTab = "gm";
  state.activeGmSceneId = "scene_test_1";
  state.gmScenes = [{
    id: "scene_test_1",
    name: "Таверна",
    gmSystemPrompt: "Ты рассказчик таверны.",
    scenario: "Уютный вечер у камина.",
    participants: []
  }];
  state.chats["scene_test_1"] = [];
  
  state.globalSystemPrompt = "Глобальные правила для всех сцен.";
  const gmContext = buildGroupScenePrompt("Осматриваемся вокруг");
  
  const gmGlobalIndex = gmContext.indexOf("<global_system_prompt priority=\"supreme\">");
  const gmSysIndex = gmContext.indexOf("<system_instruction>");
  assert.ok(gmGlobalIndex !== -1 && gmGlobalIndex < gmSysIndex, "In GM mode, global_system_prompt must come BEFORE system_instruction");
  
  console.log("✔ Test 4 passed: GM mode buildGroupScenePrompt places global_system_prompt at the very top.");
}

// Test 5: GM Mode buildApiMessages injects global prompt into GM system_reminder
{
  const gmMessages = buildApiMessages(null, "Что происходит?", null, null, {}, "scene_test_1");
  const finalGmSys = gmMessages[gmMessages.length - 1];
  
  assert.strictEqual(finalGmSys.role, "system", "Last GM message must be system reminder");
  assert.ok(finalGmSys.content.includes("👑 НАПОМИНАНИЕ: ГЛОБАЛЬНЫЕ ПРАВИЛА ИЗ НАСТРОЕК (ВЫСШИЙ ПРИОРИТЕТ):"), "GM system_reminder must include global prompt reminder");
  assert.ok(finalGmSys.content.includes("Глобальные правила для всех сцен."), "GM system_reminder must contain prompt content");
  
  console.log("✔ Test 5 passed: GM mode buildApiMessages injects global prompt reminder into final GM system_reminder.");
}

// Test 6: Empty globalSystemPrompt produces no empty tags or false reminders
{
  state.sidebarTab = "chat";
  state.globalSystemPrompt = "   ";
  const context = buildSystemContext(mockCharacter);
  assert.ok(!context.includes("<global_system_prompt"), "Empty global prompt must not produce <global_system_prompt> tag");
  
  const messages = buildApiMessages(mockCharacter, "Привет", null, null, {}, mockCharacter.id);
  const finalSys = messages[messages.length - 1];
  assert.ok(!finalSys.content.includes("👑 НАПОМИНАНИЕ: ГЛОБАЛЬНЫЕ ПРАВИЛА"), "Empty global prompt must not produce reminder in system_reminder");
  
  console.log("✔ Test 6 passed: Empty globalSystemPrompt produces no redundant tags or reminders.");
}

console.log("\n🚀 All Global System Prompt Priority Tests Passed Successfully!\n");
