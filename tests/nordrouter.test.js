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

class MockElement {
  constructor(id) {
    this.id = id;
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.style = {};
    this.classList = {
      toggle: () => {},
      add: () => {},
      remove: () => {}
    };
  }
  appendChild(child) {
    this.children.push(child);
  }
  set innerHTML(html) {
    this._innerHTML = html;
  }
  get innerHTML() {
    return this._innerHTML || '';
  }
  addEventListener() {}
  removeEventListener() {}
}

const elements = {
  apiProviderSelect: new MockElement('apiProviderSelect'),
  nordrouterFields: new MockElement('nordrouterFields'),
  nordrouterApiKeyInput: new MockElement('nordrouterApiKeyInput'),
  nordrouterBaseUrlInput: new MockElement('nordrouterBaseUrlInput'),
  openrouterFields: new MockElement('openrouterFields'),
  localLlmFields: new MockElement('localLlmFields'),
  localApiKeyInput: new MockElement('localApiKeyInput'),
  localBaseUrlInput: new MockElement('localBaseUrlInput'),
  apiKeyInput: new MockElement('apiKeyInput'),
  modelSelect: new MockElement('modelSelect'),
  customModelInput: new MockElement('customModelInput'),
  activeModelBadge: new MockElement('activeModelBadge'),
  jevModelSelect: new MockElement('jevModelSelect'),
  customJevModelInput: new MockElement('customJevModelInput'),
  jevActiveModelName: new MockElement('jevActiveModelName')
};

global.document = {
  getElementById: (id) => elements[id] || new MockElement(id),
  querySelector: (sel) => new MockElement(sel),
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement(tag),
  dispatchEvent: () => true
};

global.CustomEvent = class {
  constructor(name, opts) {
    this.name = name;
    this.detail = opts?.detail;
  }
};

async function runTests() {
  console.log('[Test] Running NordRouter provider integration tests...');

  // 1. Test storage: saveNordrouterApiKey and loadNordrouterApiKey
  const { saveNordrouterApiKey, loadNordrouterApiKey, loadApiSettings } = await import('../services/storage.js');
  
  saveNordrouterApiKey('sk-nr-test-key-12345');
  assert.strictEqual(loadNordrouterApiKey(), 'sk-nr-test-key-12345', 'loadNordrouterApiKey should return saved key');
  console.log('✓ Test 1 Passed: saveNordrouterApiKey and loadNordrouterApiKey work correctly');

  // 2. Test normalizeApiSettings
  const { normalizeApiSettings, updateProviderUI } = await import('../js/config.js');
  const normalized = normalizeApiSettings({
    apiProvider: 'nordrouter',
    nordrouterApiKey: 'sk-nr-test-key-12345',
    nordrouterBaseUrl: 'https://nordrouter.com/v1/'
  });
  assert.strictEqual(normalized.apiProvider, 'nordrouter', 'apiProvider should be nordrouter');
  assert.strictEqual(normalized.nordrouterApiKey, 'sk-nr-test-key-12345', 'nordrouterApiKey should match');
  assert.strictEqual(normalized.nordrouterBaseUrl, 'https://nordrouter.com/v1/', 'nordrouterBaseUrl should match');
  console.log('✓ Test 2 Passed: normalizeApiSettings normalizes NordRouter settings');

  // 3. Test getEffectiveApiConfig
  const { getEffectiveApiConfig } = await import('../services/apiHelper.js');
  const effectiveConfig = getEffectiveApiConfig(normalized, '');
  assert.strictEqual(effectiveConfig.apiProvider, 'nordrouter');
  assert.strictEqual(effectiveConfig.apiKey, 'sk-nr-test-key-12345');
  assert.strictEqual(effectiveConfig.baseUrl, 'https://nordrouter.com/v1');
  console.log('✓ Test 3 Passed: getEffectiveApiConfig resolves NordRouter key and baseUrl');

  // 4. Test updateProviderUI visibility toggling
  const { state } = await import('../js/state.js');
  state.apiSettings = normalized;
  updateProviderUI();

  assert.strictEqual(elements.nordrouterFields.style.display, 'block', 'nordrouterFields should be visible');
  assert.strictEqual(elements.openrouterFields.style.display, 'none', 'openrouterFields should be hidden');
  assert.strictEqual(elements.localLlmFields.style.display, 'none', 'localLlmFields should be hidden');
  console.log('✓ Test 4 Passed: updateProviderUI displays nordrouterFields and hides others');

  // 5. Test fetchModels with OpenAI-compatible NordRouter response
  let capturedFetchUrl = '';
  let capturedHeaders = null;
  global.fetch = async (url, options) => {
    capturedFetchUrl = url;
    capturedHeaders = options?.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
          { id: 'openai/gpt-4o', name: 'GPT-4o' }
        ]
      })
    };
  };

  const { fetchModels, sendMessageNonStream } = await import('../services/openrouter.js');
  const models = await fetchModels({
    apiKey: effectiveConfig.apiKey,
    baseUrl: effectiveConfig.baseUrl,
    provider: 'nordrouter'
  });

  assert.strictEqual(capturedFetchUrl, 'https://nordrouter.com/v1/models', 'fetchModels should hit /v1/models');
  assert.strictEqual(capturedHeaders['Authorization'], 'Bearer sk-nr-test-key-12345', 'fetchModels should pass Authorization header');
  assert.strictEqual(models.length, 2, 'fetchModels should parse returned models');
  assert.strictEqual(models[0].id, 'anthropic/claude-3.5-sonnet');
  console.log('✓ Test 5 Passed: fetchModels retrieves and parses models from NordRouter endpoint');

  // 6. Test sendMessageNonStream with OpenAI-compatible completions endpoint
  let capturedBody = null;
  global.fetch = async (url, options) => {
    capturedFetchUrl = url;
    capturedHeaders = options?.headers;
    capturedBody = JSON.parse(options?.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-123',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Привет из NordRouter!'
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    };
  };

  const reply = await sendMessageNonStream({
    apiKey: effectiveConfig.apiKey,
    baseUrl: effectiveConfig.baseUrl,
    model: 'anthropic/claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'Привет' }],
    apiProvider: 'nordrouter'
  });

  assert.strictEqual(capturedFetchUrl, 'https://nordrouter.com/v1/chat/completions', 'Should POST to /v1/chat/completions');
  assert.strictEqual(capturedHeaders['Authorization'], 'Bearer sk-nr-test-key-12345');
  assert.strictEqual(capturedBody.model, 'anthropic/claude-3.5-sonnet');
  assert.strictEqual(reply, 'Привет из NordRouter!');
  console.log('✓ Test 6 Passed: sendMessageNonStream successfully communicates with NordRouter');

  // 7. Test renderModelOptions with NordRouter defaults
  const { renderModelOptions } = await import('../js/config.js');
  state.models = ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'];
  renderModelOptions();

  assert.strictEqual(elements.jevModelSelect.value, 'typesafe-ai/jev', 'Should default to typesafe-ai/jev when on NordRouter');
  assert.strictEqual(elements.jevActiveModelName.textContent, 'typesafe-ai/jev', 'Active Jev model badge should show typesafe-ai/jev');
  console.log('✓ Test 7 Passed: renderModelOptions sets typesafe-ai/jev as default for NordRouter');

  // 8. Test askJevSystemOne with NordRouter /v1/evaluate endpoint
  const { askJevSystemOne, testJevConnection, askJevChoice, askJevScore } = await import('../services/jevService.js');
  let jevFetchUrl = '';
  let jevHeaders = null;
  let jevBody = null;

  global.fetch = async (url, options) => {
    jevFetchUrl = url;
    jevHeaders = options?.headers;
    jevBody = JSON.parse(options?.body);
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) => (h.toLowerCase() === 'x-charged-usd' ? '0.0000219' : null)
      },
      json: async () => ({
        id: 'eval-123',
        model: jevBody.model,
        answers: {
          urgent: { type: 'boolean', probability: 0.85 }
        },
        usage: { input_tokens: 434, output_tokens: 82 }
      })
    };
  };

  const jevRes = await askJevSystemOne({
    apiKey: effectiveConfig.apiKey,
    baseUrl: effectiveConfig.baseUrl,
    apiProvider: 'nordrouter',
    state: 'Заказ №1841 не пришёл, клиент пишет третий раз, тон резкий',
    questions: {
      urgent: {
        type: 'boolean',
        question: 'Это срочно?',
        criteria: { true: 'повторное обращение или резкий тон', false: 'первое спокойное' }
      }
    }
  });

  assert.strictEqual(jevRes.ok, true);
  assert.strictEqual(jevFetchUrl, 'https://nordrouter.com/v1/evaluate', 'Should POST to NordRouter /v1/evaluate');
  assert.strictEqual(jevHeaders['Authorization'], 'Bearer sk-nr-test-key-12345');
  assert.strictEqual(jevBody.model, 'typesafe-ai/jev', 'Default NordRouter Jev model should be typesafe-ai/jev');
  assert.strictEqual(jevBody.questions.urgent.type, 'boolean');
  assert.strictEqual(jevBody.questions.urgent.question, 'Это срочно?');
  assert.strictEqual(jevRes.answers.urgent.probability, 0.85);
  assert.strictEqual(jevRes.answers.urgent.noul, 0.85, 'Both probability and noul should be accessible');
  assert.strictEqual(jevRes.costUsd, 0.0000219, 'Should parse X-Charged-USD header');
  assert.strictEqual(jevRes.usage.prompt_tokens, 434);
  assert.strictEqual(jevRes.usage.completion_tokens, 82);
  console.log('✓ Test 8 Passed: askJevSystemOne matches official NordRouter documentation');

  // 9. Test automatic question normalization (noul -> boolean, instructions -> question)
  await askJevSystemOne({
    apiKey: effectiveConfig.apiKey,
    baseUrl: effectiveConfig.baseUrl,
    apiProvider: 'nordrouter',
    state: 'Контекст',
    questions: {
      check: { type: 'noul', instructions: 'Всё в порядке?' }
    }
  });
  assert.strictEqual(jevBody.questions.check.type, 'boolean', 'noul should be converted to boolean');
  assert.strictEqual(jevBody.questions.check.question, 'Всё в порядке?', 'question should be populated from instructions');
  console.log('✓ Test 9 Passed: questions are normalized to NordRouter specifications');

  // 10. Test 429 Retry-After handling
  let callCount = 0;
  global.fetch = async (url, options) => {
    callCount++;
    jevFetchUrl = url;
    if (callCount === 1) {
      return {
        ok: false,
        status: 429,
        headers: {
          get: (h) => (h.toLowerCase() === 'retry-after' ? '0' : null)
        },
        text: async () => 'Rate limit exceeded'
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        id: 'eval-retry',
        model: 'typesafe-ai/jev',
        answers: { ok: { type: 'boolean', probability: 0.99 } }
      })
    };
  };

  const retryRes = await askJevSystemOne({
    apiKey: effectiveConfig.apiKey,
    baseUrl: effectiveConfig.baseUrl,
    apiProvider: 'nordrouter',
    state: 'Retry test',
    questions: { ok: { type: 'boolean', question: 'Ok?' } }
  });
  assert.strictEqual(retryRes.ok, true, 'Should succeed after retry');
  assert.strictEqual(callCount, 2, 'Should make 2 attempts on 429');
  console.log('✓ Test 10 Passed: 429 Rate Limit Retry-After handled automatically');

  // 11. Test Choice and Score helpers
  global.fetch = async (url, options) => {
    jevBody = JSON.parse(options?.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        id: 'eval-choice',
        model: 'typesafe-ai/jev',
        answers: {
          q_main: {
            type: 'choice',
            choice: 'доставка',
            probabilities: { доставка: 1, биллинг: 0 },
            confidence: 0.99
          }
        }
      })
    };
  };

  const choiceRes = await askJevChoice({
    apiKey: effectiveConfig.apiKey,
    baseUrl: effectiveConfig.baseUrl,
    apiProvider: 'nordrouter',
    state: 'Заказ №1841 не пришёл',
    question: 'Кому передать',
    criteria: { доставка: 'про заказ и сроки', биллинг: 'про деньги' }
  });
  assert.strictEqual(choiceRes.choice, 'доставка');
  assert.strictEqual(choiceRes.confidence, 0.99);
  assert.strictEqual(jevBody.questions.q_main.type, 'choice');
  console.log('✓ Test 11 Passed: askJevChoice works according to choice schema');

  // 12. Test testJevConnection with NordRouter
  const testConnRes = await testJevConnection({
    apiKey: effectiveConfig.apiKey,
    baseUrl: effectiveConfig.baseUrl,
    apiProvider: 'nordrouter'
  });
  assert.strictEqual(testConnRes.ok, true);
  console.log('✓ Test 12 Passed: testJevConnection functions properly with NordRouter configuration');

  console.log('\nAll NordRouter & JEV integration tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
