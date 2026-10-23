const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 3456;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split(/[?#]/)[0];
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

async function runTest() {
  server.listen(PORT, async () => {
    console.log(`Test server listening on port ${PORT}`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    try {
      await page.goto(`http://localhost:${PORT}`);
      await page.waitForLoadState('domcontentloaded');

      await page.evaluate(() => {
        const charId = "test-char-swipe";
        const chatId = "chat_test_swipe";
        const characters = [
          {
            id: charId,
            name: "Серафима",
            tagline: "Хранительница библиотеки",
            description: "Таинственная девушка с серебряными волосами.",
            personality: "Спокойная, вдумчивая",
            firstMessage: "Приветствую вас в архивах древних знаний.",
            coreStates: []
          }
        ];
        const chatMetadata = {
          [charId]: [{ id: chatId, name: "Chat 1", createdAt: Date.now() }]
        };
        const chats = {
          [chatId]: [
            {
              role: "assistant",
              content: "Привет! Это первый вариант ответа персонажа.",
              swipes: [
                "Привет! Это первый вариант ответа персонажа.",
                "Здравствуй! Это второй альтернативный вариант ответа.",
                "Рад встрече! Это третий вариант с новыми деталями сюжета."
              ],
              swipeIndex: 0,
              timestamp: Date.now()
            }
          ]
        };
        localStorage.setItem("openrouter_characters_v1", JSON.stringify(characters));
        localStorage.setItem("openrouter_chat_metadata_v1", JSON.stringify(chatMetadata));
        localStorage.setItem("openrouter_active_chat_id_" + charId, chatId);
        localStorage.setItem("openrouter_active_character_id_v1", charId);
        localStorage.setItem("openrouter_chats_v1", JSON.stringify(chats));
      });

      await page.reload();
      await page.waitForTimeout(600);

      const swipeBar = await page.waitForSelector('.message-swipe-bar', { timeout: 3000 });
      console.log("✓ Swipe bar found in DOM");

      let counterText = await page.locator('.swipe-counter').textContent();
      console.log(`Initial counter: ${counterText}`);
      if (counterText !== "1/3") throw new Error(`Expected 1/3, got ${counterText}`);

      let msgText = await page.locator('.message.assistant .dialogue-text').textContent();
      console.log(`Initial message text: ${msgText.trim()}`);
      if (!msgText.includes("первый вариант")) throw new Error("Incorrect initial text");

      // Click next swipe '>'
      await page.click('.swipe-next');
      await page.waitForTimeout(300);

      counterText = await page.locator('.swipe-counter').textContent();
      console.log(`After next click counter: ${counterText}`);
      if (counterText !== "2/3") throw new Error(`Expected 2/3, got ${counterText}`);

      msgText = await page.locator('.message.assistant .dialogue-text').textContent();
      console.log(`Message text after next: ${msgText.trim()}`);
      if (!msgText.includes("второй альтернативный")) throw new Error("Incorrect text after next");

      // Click next swipe again to reach 3/3
      await page.click('.swipe-next');
      await page.waitForTimeout(300);

      counterText = await page.locator('.swipe-counter').textContent();
      console.log(`After second next click counter: ${counterText}`);
      if (counterText !== "3/3") throw new Error(`Expected 3/3, got ${counterText}`);

      msgText = await page.locator('.message.assistant .dialogue-text').textContent();
      console.log(`Message text at 3/3: ${msgText.trim()}`);
      if (!msgText.includes("третий вариант")) throw new Error("Incorrect text at 3/3");

      // Test Alt+ArrowLeft hotkey to go back to 2/3
      await page.keyboard.press('Alt+ArrowLeft');
      await page.waitForTimeout(300);

      counterText = await page.locator('.swipe-counter').textContent();
      console.log(`After Alt+ArrowLeft counter: ${counterText}`);
      if (counterText !== "2/3") throw new Error(`Expected 2/3 from hotkey, got ${counterText}`);

      // Test Alt+ArrowRight hotkey to go back to 3/3
      await page.keyboard.press('Alt+ArrowRight');
      await page.waitForTimeout(300);

      counterText = await page.locator('.swipe-counter').textContent();
      console.log(`After Alt+ArrowRight counter: ${counterText}`);
      if (counterText !== "3/3") throw new Error(`Expected 3/3 from hotkey, got ${counterText}`);

      // Test swipe prev button to go back to 2/3
      await page.click('.swipe-prev');
      await page.waitForTimeout(300);

      counterText = await page.locator('.swipe-counter').textContent();
      console.log(`After swipe-prev click counter: ${counterText}`);
      if (counterText !== "2/3") throw new Error(`Expected 2/3 from prev button, got ${counterText}`);

      const screenshotDir = '/home/riko/.gemini/antigravity/brain/357a6228-f21b-41ac-8b6c-834510d14517/screenshots';
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      const screenshotPath = `${screenshotDir}/08_swipe_feature.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`✓ Screenshot saved to ${screenshotPath}`);

      console.log("=== ALL SWIPE TESTS PASSED SUCCESSFULLY! ===");
    } catch (err) {
      console.error("Test failed:", err);
      process.exitCode = 1;
    } finally {
      await browser.close();
      server.close();
      process.exit(process.exitCode || 0);
    }
  });
}

runTest();
