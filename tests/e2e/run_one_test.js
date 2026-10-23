const HeadlessBrowser = require('../helpers/browser.js');
const { startServer } = require('../helpers/server.js');

async function testDebug() {
  let server = null;
  let browser = null;
  try {
    server = await startServer();
    browser = new HeadlessBrowser();
    await browser.launch();

    await browser.navigate('http://localhost:3000');
    await browser.evaluate("localStorage.clear()");
    await browser.navigate('http://localhost:3000');
    
    const debugInfo = await browser.evaluate(`
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

        const updatedInState = stateModule.state.characters.find(c => c.id === 'char_test_refine');
        const savedInStorage = JSON.parse(localStorage.getItem('openrouter_characters') || '[]');
        const updatedInStorage = savedInStorage.find(c => c.id === 'char_test_refine');

        return {
          updatedInState,
          updatedInStorage,
          allStateChars: stateModule.state.characters,
          domIdVal: uiModule.dom?.characterId?.value
        };
      })()
    `);

    console.log('DEBUG WIZARD_SAVE_1 RESULT:', JSON.stringify(debugInfo, null, 2));

  } catch (err) {
    console.error('Test script error:', err);
  } finally {
    if (browser) await browser.cleanup();
    if (server) {
      await server.stop();
    }
  }
}

testDebug();
