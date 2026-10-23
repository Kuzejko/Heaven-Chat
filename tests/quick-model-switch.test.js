import assert from 'assert';

const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] || null
};

class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(c) { this.classes.add(c); }
  remove(c) { this.classes.delete(c); }
  contains(c) { return this.classes.has(c); }
  toggle(c, force) {
    if (force === undefined) {
      if (this.classes.has(c)) this.classes.delete(c);
      else this.classes.add(c);
    } else if (force) {
      this.classes.add(c);
    } else {
      this.classes.delete(c);
    }
  }
}

class MockElement {
  constructor(id) {
    this.id = id;
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.title = '';
    this.style = {};
    this.classList = new MockClassList();
    this.options = [];
  }
  appendChild(child) {
    this.children.push(child);
    this.options.push(child);
  }
  addEventListener() {}
  removeEventListener() {}
}

const elementsMap = new Map();
function getOrCreateMockElement(id) {
  if (!elementsMap.has(id)) {
    elementsMap.set(id, new MockElement(id));
  }
  return elementsMap.get(id);
}

global.document = {
  getElementById: (id) => getOrCreateMockElement(id),
  querySelector: (sel) => getOrCreateMockElement(sel),
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag)
};

const { state } = await import('../js/state.js');
const { dom } = await import('../js/ui.js');
const {
  switchQuickModel,
  updateQuickModelSwitcherUI,
  updateActiveModelBadge
} = await import('../js/config.js');

console.log('[Test] Running Quick Model Switcher tests...');

// 1. Setup mock state
state.characters = [
  { id: 'kevin', name: 'Кевин', model: 'z-ai/glm-5.3-flash' }
];
state.activeCharacterId = 'kevin';
state.models = ['z-ai/glm-5.2', 'z-ai/glm-5.3-flash', 'openai/gpt-4o-mini'];
state.apiSettings = {
  selectedModel: 'z-ai/glm-5.3-flash'
};

// 2. Test initial updateQuickModelSwitcherUI with GLM 5.3 Flash
updateQuickModelSwitcherUI();
assert.strictEqual(dom.quickModelBtnGlm53Flash.classList.contains('active'), true, 'GLM 5.3 Flash button should be active');
assert.strictEqual(dom.quickModelBtnGlm52.classList.contains('active'), false, 'GLM 5.2 button should not be active');
assert.strictEqual(dom.sidebarModelActiveName.textContent, 'GLM 5.3 Flash', 'Label should show GLM 5.3 Flash');
console.log('✓ Test 1 Passed: Initial state correctly identifies GLM 5.3 Flash');

// 3. Test switching to GLM 5.2
const res52 = switchQuickModel('5.2');
assert.strictEqual(res52.modelId, 'z-ai/glm-5.2', 'switchQuickModel should resolve to z-ai/glm-5.2');
assert.strictEqual(state.apiSettings.selectedModel, 'z-ai/glm-5.2', 'State selectedModel should be z-ai/glm-5.2');
assert.strictEqual(state.characters[0].model, 'z-ai/glm-5.2', 'Active character model should update to z-ai/glm-5.2');
assert.strictEqual(dom.quickModelBtnGlm52.classList.contains('active'), true, 'GLM 5.2 button should be active');
assert.strictEqual(dom.quickModelBtnGlm53Flash.classList.contains('active'), false, 'GLM 5.3 Flash button should not be active');
assert.strictEqual(dom.sidebarModelActiveName.textContent, 'GLM 5.2', 'Label should show GLM 5.2');
console.log('✓ Test 2 Passed: Switching to GLM 5.2 updates settings, character, and buttons');

// 4. Test switching back to GLM 5.3 Flash
const res53 = switchQuickModel('5.3');
assert.strictEqual(res53.modelId, 'z-ai/glm-5.3-flash', 'switchQuickModel should resolve to z-ai/glm-5.3-flash');
assert.strictEqual(state.apiSettings.selectedModel, 'z-ai/glm-5.3-flash', 'State selectedModel should be z-ai/glm-5.3-flash');
assert.strictEqual(state.characters[0].model, 'z-ai/glm-5.3-flash', 'Active character model should update to z-ai/glm-5.3-flash');
assert.strictEqual(dom.quickModelBtnGlm53Flash.classList.contains('active'), true, 'GLM 5.3 Flash button should be active');
assert.strictEqual(dom.quickModelBtnGlm52.classList.contains('active'), false, 'GLM 5.2 button should not be active');
console.log('✓ Test 3 Passed: Switching back to GLM 5.3 Flash works correctly');

// 5. Test with an external model (e.g. gpt-4o-mini)
state.apiSettings.selectedModel = 'openai/gpt-4o-mini';
updateQuickModelSwitcherUI();
assert.strictEqual(dom.quickModelBtnGlm52.classList.contains('active'), false, 'GLM 5.2 button should not be active for other model');
assert.strictEqual(dom.quickModelBtnGlm53Flash.classList.contains('active'), false, 'GLM 5.3 Flash button should not be active for other model');
assert.strictEqual(dom.sidebarModelActiveName.textContent, 'gpt-4o-mini', 'Label should show gpt-4o-mini');
console.log('✓ Test 4 Passed: Third-party models unselect pills and update label');

console.log('\n[Test] All Quick Model Switcher tests passed successfully!\n');
