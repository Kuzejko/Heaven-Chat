const test = require('node:test');
const assert = require('node:assert');
const HeadlessBrowser = require('../helpers/browser.js');

test('Framework: Loads page and checks title', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  
  try {
    await browser.navigate('http://localhost:3000');
    const title = await browser.evaluate('document.title');
    console.log(`[test] Document title is: "${title}"`);
    assert.strictEqual(title, 'Heaven Chat');
  } finally {
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});
