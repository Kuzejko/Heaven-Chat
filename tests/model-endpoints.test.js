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
  }
  appendChild(child) {
    this.children.push(child);
  }
  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    if (html.includes('<option')) {
      const opt = new MockOption('', 'Auto');
      this.children.push(opt);
    }
  }
  get innerHTML() {
    return this._innerHTML || '';
  }
  addEventListener() {}
  removeEventListener() {}
}

class MockOption {
  constructor(value, textContent) {
    this.value = value;
    this.textContent = textContent;
  }
}

const mockSelect = new MockElement('specificProviderSelect');
const mockStatus = new MockElement('specificProviderStatus');

global.document = {
  getElementById: (id) => {
    if (id === 'specificProviderSelect') return mockSelect;
    if (id === 'specificProviderStatus') return mockStatus;
    return new MockElement(id);
  },
  querySelector: (sel) => new MockElement(sel),
  querySelectorAll: () => [],
  createElement: (tag) => {
    if (tag === 'option') return new MockOption('', '');
    return new MockElement(tag);
  }
};

const { state } = await import('../js/state.js');
const {
  fetchModelEndpoints,
  buildProviderRoutingConfig
} = await import('../services/openrouter.js');
const {
  updateModelProvidersUI,
  syncApiSettingsFromInputs,
  normalizeApiSettings
} = await import('../js/config.js');
const { dom } = await import('../js/ui.js');

const mockEndpointsResponse = {
  data: {
    id: "z-ai/glm-5.2",
    context_length: 128000,
    endpoints: [
      {
        name: "Decart",
        provider_name: "Decart",
        pricing: {
          prompt: "0.000000684",
          completion: "0.00000228"
        },
        context_length: 128000,
        quantization: "fp8",
        supported_parameters: ["temperature", "tools"]
      },
      {
        name: "DeepInfra",
        provider_name: "DeepInfra",
        pricing: {
          prompt: "0.00000075",
          completion: "0.0000024"
        },
        context_length: 64000,
        quantization: "fp4",
        supported_parameters: ["temperature", "tools"]
      },
      {
        name: "Fireworks",
        provider_name: "Fireworks",
        pricing: {
          prompt: "0.0000014",
          completion: "0.0000044"
        },
        context_length: 128000,
        quantization: null,
        supported_parameters: ["temperature"]
      }
    ]
  }
};

global.fetch = async (url, options) => {
  if (url.includes('/models/z-ai/glm-5.2/endpoints')) {
    return {
      ok: true,
      status: 200,
      json: async () => mockEndpointsResponse,
      text: async () => JSON.stringify(mockEndpointsResponse)
    };
  }
  return {
    ok: false,
    status: 404,
    json: async () => ({}),
    text: async () => 'Not found'
  };
};

console.log('[Test] Running Model Endpoints and Provider Selector tests...');

const endpoints = await fetchModelEndpoints("z-ai/glm-5.2", { forceRefresh: true });
assert.strictEqual(endpoints.length, 3, 'Should parse 3 endpoints');
assert.strictEqual(endpoints[0].providerName, 'Decart');
assert.strictEqual(endpoints[0].quantization, 'fp8');
assert.strictEqual(endpoints[0].contextLength, 128000);
assert.strictEqual(endpoints[1].providerName, 'DeepInfra');
console.log('✓ Test 1 Passed: fetchModelEndpoints parsed response correctly');

assert.ok(state.modelEndpointsCache["z-ai/glm-5.2"], 'Should cache endpoints in state');
assert.strictEqual(state.modelEndpointsCache["z-ai/glm-5.2"].length, 3);
console.log('✓ Test 2 Passed: Caching verified');

state.apiSettings = normalizeApiSettings({
  apiProvider: 'openrouter',
  selectedModel: 'z-ai/glm-5.2',
  specificProvider: 'DeepInfra'
});
dom.specificProviderSelect = mockSelect;
dom.specificProviderStatus = mockStatus;

await updateModelProvidersUI('z-ai/glm-5.2');
assert.ok(mockSelect.children.length >= 4, 'Should populate auto option plus 3 provider options');
assert.strictEqual(mockSelect.value, 'DeepInfra', 'Should select DeepInfra');
assert.ok(mockStatus.textContent.includes('3'), 'Status should report 3 available providers');
console.log('✓ Test 3 Passed: updateModelProvidersUI populated select options correctly');

const routingConfig = buildProviderRoutingConfig();
assert.ok(routingConfig, 'Routing config should be generated');
assert.deepStrictEqual(routingConfig.order, ['DeepInfra'], 'Routing config should specify selected provider in order');
console.log('✓ Test 4 Passed: buildProviderRoutingConfig sets provider.order correctly');

console.log('\n[Test] All model endpoint tests passed successfully!\n');
