const HeadlessBrowser = require('../tests/helpers/browser.js');
const path = require('path');

async function test() {
  const browser = new HeadlessBrowser();
  await browser.launch();
  try {
    await browser.navigate(`file:///${path.resolve(__dirname, '../index.html').replace(/\\/g, '/')}`);
    
    await browser.evaluate(`
      window.lastAlert = null;
      window.alert = function(msg) { window.lastAlert = msg; };
      window.lastError = null;
      window.addEventListener("error", (e) => { window.lastError = e.message; });
      window.addEventListener("unhandledrejection", (e) => { window.lastError = e.reason ? e.reason.message || e.reason : "Unhandled rejection"; });
      
      // Setup some default inputs
      document.getElementById("characterName").value = "TestCharacter";
      document.getElementById("characterBehavior").value = "TestBehavior";
    `);
    
    await browser.evaluate(`document.getElementById("generateScenarioBtn").click();`);
    
    // Wait until textarea is filled or 5 seconds pass
    await browser.evaluate(`
      new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const val = document.getElementById("characterScenario").value;
          const alertMsg = window.lastAlert;
          if (val || alertMsg || attempts > 50) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    `);
    
    const alertMsg = await browser.evaluate(`window.lastAlert`);
    const error = await browser.evaluate(`window.lastError`);
    const val = await browser.evaluate(`document.getElementById("characterScenario").value`);
    console.log("Alert after clicking:", alertMsg);
    console.log("Error after clicking:", error);
    console.log("Value generated:", val);
    
  } finally {
    await browser.cleanup();
  }
}

test().catch(console.error);
