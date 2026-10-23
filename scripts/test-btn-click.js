const HeadlessBrowser = require('../tests/helpers/browser.js');
const path = require('path');

async function test() {
  const browser = new HeadlessBrowser();
  await browser.launch();
  try {
    await browser.navigate(`file:///${path.resolve(__dirname, '../index.html').replace(/\\/g, '/')}`);
    
    await browser.evaluate(`
      window.buttonWasDisabled = false;
      document.getElementById("generateScenarioBtn").addEventListener("click", () => {
        setTimeout(() => {
          window.buttonWasDisabled = document.getElementById("generateScenarioBtn").disabled;
        }, 10);
      });
    `);
    
    await browser.evaluate(`document.getElementById("generateScenarioBtn").click();`);
    
    await new Promise(r => setTimeout(r, 500));
    
    const wasDisabled = await browser.evaluate(`window.buttonWasDisabled`);
    console.log("Button was disabled shortly after click:", wasDisabled);
    
  } finally {
    await browser.cleanup();
  }
}

test().catch(console.error);
