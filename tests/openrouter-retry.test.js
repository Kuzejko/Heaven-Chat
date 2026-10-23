import assert from 'assert';

// Set up mock localStorage and document
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] || null
};

const dispatchedEvents = [];
global.document = {
  dispatchEvent: (event) => {
    dispatchedEvents.push(event);
  }
};

global.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail || {};
  }
};

const {
  extractRateLimitInfo,
  mapOpenRouterError,
  sendMessageStream,
  sendMessageNonStream
} = await import('../services/openrouter.js');

console.log('[Test] Running OpenRouter 429 Auto-Retry tests...');

// Test 1: Extract rate limit info from user's exact error JSON payload
const userErrorPayload = JSON.stringify({
  error: {
    message: "Provider returned error",
    code: 429,
    metadata: {
      raw: "z-ai/glm-5.2:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations",
      provider_name: "Decart",
      is_byok: false,
      provider_error_code: "upstream_429",
      limit_source: "upstream_provider_shared_pool",
      remedy_hint: "Retry shortly, add your own provider key (https://openrouter.ai/settings/integrations), or route to another provider with provider routing: https://openrouter.ai/docs/features/provider-routing",
      retry_after_seconds: 5,
      retry_after_seconds_raw: 5,
      headers: {
        "Retry-After": "5"
      }
    }
  },
  user_id: "user_323EcM0XdGBTQZOGl5k4V745oXH"
});

const info1 = extractRateLimitInfo(userErrorPayload, null, 429);
assert.strictEqual(info1.isRateLimit, true, 'Should detect isRateLimit');
assert.strictEqual(info1.retryAfterSeconds, 5, 'Should extract retryAfterSeconds = 5');
console.log('✓ extractRateLimitInfo parses Decart upstream_429 and retry_after_seconds = 5 correctly');

// Test 2: Extract rate limit info from headers
const mockHeaders = new Map([['retry-after', '10']]);
const info2 = extractRateLimitInfo('Rate limit exceeded', mockHeaders, 429);
assert.strictEqual(info2.isRateLimit, true);
assert.strictEqual(info2.retryAfterSeconds, 10);
console.log('✓ extractRateLimitInfo parses Retry-After header correctly');

// Test 3: mapOpenRouterError formats error cleanly instead of raw JSON
const formatted = mapOpenRouterError(new Error(userErrorPayload));
assert.ok(!formatted.startsWith('{'), 'Should not be raw JSON string');
assert.ok(formatted.includes('temporarily rate-limited') || formatted.includes('Provider returned error'), 'Should have meaningful text');
console.log('✓ mapOpenRouterError extracts clean message from JSON');

// Test 4: Auto-retry in sendMessageNonStream on 429 error
let nonStreamAttempts = 0;
const originalFetch = global.fetch;

// Fast mock sleep helper by mocking setTimeout in test or fast response
global.fetch = async (url, options) => {
  nonStreamAttempts++;
  if (nonStreamAttempts === 1) {
    // Return 429 with retry_after_seconds: 0.05 for fast test execution
    const errorJson = JSON.stringify({
      error: {
        message: "Provider returned error",
        code: 429,
        metadata: {
          retry_after_seconds: 0.05,
          provider_error_code: "upstream_429"
        }
      }
    });
    return {
      ok: false,
      status: 429,
      headers: { get: (k) => null },
      text: async () => errorJson
    };
  }

  // Second attempt succeeds!
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => null },
    json: async () => ({
      choices: [{
        message: { content: "Success response after 429 retry!" }
      }]
    })
  };
};

const resultText = await sendMessageNonStream({
  apiKey: "test-key",
  model: "z-ai/glm-5.2:free",
  messages: [{ role: "user", content: "Hello" }]
});

assert.strictEqual(nonStreamAttempts, 2, 'Should have retried after 429');
assert.strictEqual(resultText, "Success response after 429 retry!");
console.log('✓ sendMessageNonStream automatically retries on 429 and returns text successfully');

// Test 5: Auto-retry in sendMessageStream on 429 error
let streamAttempts = 0;
global.fetch = async (url, options) => {
  streamAttempts++;
  if (streamAttempts === 1) {
    const errorJson = JSON.stringify({
      error: {
        message: "Provider returned error",
        code: 429,
        metadata: {
          retry_after_seconds: 0.05,
          provider_error_code: "upstream_429"
        }
      }
    });
    return {
      ok: false,
      status: 429,
      headers: { get: (k) => null },
      text: async () => errorJson
    };
  }

  // Second attempt streams tokens
  const sseData = [
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"world!"}}]}\n\n',
    'data: [DONE]\n\n'
  ];
  let chunkIndex = 0;

  const mockStream = {
    getReader: () => ({
      read: async () => {
        if (chunkIndex < sseData.length) {
          const chunk = new TextEncoder().encode(sseData[chunkIndex++]);
          return { done: false, value: chunk };
        }
        return { done: true, value: undefined };
      },
      releaseLock: () => {},
      cancel: async () => {}
    })
  };

  return {
    ok: true,
    status: 200,
    headers: { get: (k) => null },
    body: mockStream
  };
};

let streamedTokens = "";
const streamResult = await sendMessageStream({
  apiKey: "test-key",
  model: "z-ai/glm-5.2:free",
  messages: [{ role: "user", content: "Hello" }],
  onToken: (agg, token) => {
    streamedTokens += token;
  }
});

assert.strictEqual(streamAttempts, 2, 'Should have retried stream after 429');
assert.strictEqual(streamResult, "Hello world!");
console.log('✓ sendMessageStream automatically retries on 429 and streams tokens to completion');

// Test 6: AbortController aborts retry immediately
const abortController = new AbortController();
let abortAttempts = 0;
global.fetch = async (url, options) => {
  abortAttempts++;
  // Return 429 with 5 second delay
  return {
    ok: false,
    status: 429,
    headers: { get: (k) => null },
    text: async () => JSON.stringify({ error: { code: 429, metadata: { retry_after_seconds: 5 } } })
  };
};

setTimeout(() => {
  abortController.abort();
}, 20);

try {
  await sendMessageNonStream({
    apiKey: "test-key",
    model: "z-ai/glm-5.2:free",
    messages: [{ role: "user", content: "Hello" }],
    signal: abortController.signal
  });
  assert.fail('Should have thrown AbortError');
} catch (err) {
  assert.ok(err.name === 'AbortError' || err.message === 'Aborted', 'Should catch AbortError');
  console.log('✓ AbortController cancels active retry countdown immediately');
}

// Restore fetch
global.fetch = originalFetch;

console.log('\nAll OpenRouter 429 Auto-Retry tests passed successfully!');
