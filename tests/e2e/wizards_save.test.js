const test = require('node:test');
const assert = require('node:assert');
const HeadlessBrowser = require('../helpers/browser.js');

async function runWithBrowser(callback) {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.navigate('http://localhost:3000');
    await browser.evaluate("localStorage.clear()");
    await browser.navigate('http://localhost:3000');
    await callback(browser);
  } finally {
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
}

test('WIZARD_SAVE_1: Verify character refinement applies and persists directly to storage', async () => {
  await runWithBrowser(async (browser) => {
    const result = await browser.evaluate(`
      (async () => {
        const wizards = await import('/js/wizards.js');
        const stateModule = await import('/js/state.js');
        const storageModule = await import('/services/storage.js');
        const uiModule = await import('/js/ui.js');
        
        // Prepare initial character in state
        const testChar = {
          id: 'char_test_refine',
          name: 'Original Character',
          description: 'Original Description',
          behavior: 'Calm',
          scenario: 'Original Scenario',
          firstMessage: 'Hello!',
          systemPrompt: 'You are helpful.'
        };
        stateModule.state.characters = [testChar];
        stateModule.state.activeCharacterId = 'char_test_refine';
        storageModule.saveCharacters(stateModule.state.characters);

        if (uiModule.dom && uiModule.dom.characterId) {
          uiModule.dom.characterId.value = 'char_test_refine';
        }

        // Call applyRefinedProfileToForm with refined fields
        const refinedData = {
          name: 'Refined Hero',
          description: 'Refined Super Description',
          behavior: 'Brave and Bold',
          scenario: 'Castle Dungeon',
          firstMessage: '*Draws sword* Greetings traveler!',
          systemPrompt: 'You are a fearless dragon slayer.'
        };

        wizards.applyRefinedProfileToForm(refinedData);

        // Check state.characters and localStorage via storageModule
        const updatedInState = stateModule.state.characters.find(c => c.id === 'char_test_refine');
        const savedInStorage = storageModule.loadCharacters();
        const updatedInStorage = savedInStorage.find(c => c.id === 'char_test_refine');

        return {
          stateName: updatedInState ? updatedInState.name : null,
          stateBehavior: updatedInState ? updatedInState.behavior : null,
          storageName: updatedInStorage ? updatedInStorage.name : null,
          storageBehavior: updatedInStorage ? updatedInStorage.behavior : null,
          storageScenario: updatedInStorage ? updatedInStorage.scenario : null
        };
      })()
    `);

    assert.strictEqual(result.stateName, 'Refined Hero');
    assert.strictEqual(result.stateBehavior, 'Brave and Bold');
    assert.strictEqual(result.storageName, 'Refined Hero');
    assert.strictEqual(result.storageBehavior, 'Brave and Bold');
    assert.strictEqual(result.storageScenario, 'Castle Dungeon');
  });
});

test('WIZARD_SAVE_2: Verify extractAndParseProfileJson restores truncated responses', async () => {
  await runWithBrowser(async (browser) => {
    const parseResult = await browser.evaluate(`
      (async () => {
        const wizards = await import('/js/wizards.js');
        
        const truncatedResponse = "Here is the refined character:\\n\`\`\`json\\n{\\n  \\"name\\": \\"Truncated Hero\\",\\n  \\"description\\": \\"Very long description that was cut off...";
        const parsed = wizards.extractAndParseProfileJson(truncatedResponse);
        return parsed;
      })()
    `);

    assert.ok(parseResult, 'Parsed object should not be null');
    assert.strictEqual(parseResult.name, 'Truncated Hero');
  });
});
