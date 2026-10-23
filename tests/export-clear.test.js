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
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
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
  createElement: (tag) => ({ ...mockNode, href: '', download: '' }),
  getElementById: () => mockNode,
  querySelector: () => mockNode,
  querySelectorAll: () => [],
  body: mockNode
};

global.Blob = class Blob {
  constructor(parts) {
    this.parts = parts;
  }
};
global.URL = {
  createObjectURL: () => 'blob:test-url',
  revokeObjectURL: () => {}
};

// Import state and config modules
const { state } = await import('../js/state.js');
const { exportAllDataJSON, exportData, clearEnvironment, clearData } = await import('../js/config.js');
const { clearAllStorageData, exportAllStorageData } = await import('../services/storage.js');

console.log('[Test] Running export & clear environment tests...');

// Test 1: clearEnvironment
clearEnvironment();
assert.strictEqual(typeof state.chats, 'object');
assert.strictEqual(Object.keys(state.chats).length, 0);
assert.strictEqual(state.globalSystemPrompt, '');
console.log('✓ clearEnvironment resets state and storage cleanly');

// Test 2: exportAllDataJSON
state.chats = { test_char: [{ role: 'user', content: 'Hello' }] };
state.globalSystemPrompt = 'Test Prompt';
const exported = exportAllDataJSON();

assert.strictEqual(exported.version, '1.0');
assert.ok(exported.exportedAt);
assert.strictEqual(exported.globalSystemPrompt, 'Test Prompt');
assert.deepStrictEqual(exported.chats, state.chats);
console.log('✓ exportAllDataJSON returns complete payload structure');

// Test 3: exportData alias
const exportedAlias = exportData();
assert.strictEqual(exportedAlias.globalSystemPrompt, exported.globalSystemPrompt);
assert.deepStrictEqual(exportedAlias.chats, exported.chats);
console.log('✓ exportData alias works identically');

// Test 4: clearData alias
clearData();
assert.strictEqual(Object.keys(state.chats).length, 0);
assert.strictEqual(state.globalSystemPrompt, '');
console.log('✓ clearData alias resets environment cleanly');

// Test 5: Storage helpers
localStorage.setItem('openrouter_test_key', JSON.stringify({ a: 1 }));
const storageData = exportAllStorageData();
assert.deepStrictEqual(storageData.openrouter_test_key, { a: 1 });

clearAllStorageData();
assert.strictEqual(localStorage.getItem('openrouter_test_key'), null);
// Test 6: safeLocalStorageSet QuotaExceeded recovery
const { saveChats } = await import('../services/storage.js');
let setItemCalls = 0;
const originalSetItem = global.localStorage.setItem;
global.localStorage.setItem = (k, v) => {
  setItemCalls++;
  if (setItemCalls === 1) {
    const err = new Error('QuotaExceededError');
    err.name = 'QuotaExceededError';
    throw err;
  }
  return originalSetItem(k, v);
};

saveChats({ test_char: Array.from({ length: 100 }, (_, i) => ({ role: 'user', content: `Msg ${i}` })) });
assert.ok(localStorage.getItem('openrouter_chats_v1'));
global.localStorage.setItem = originalSetItem;
console.log('✓ safeLocalStorageSet quota recovery handles QuotaExceededError without throwing');

console.log('\nAll export & clear tests passed successfully!');
