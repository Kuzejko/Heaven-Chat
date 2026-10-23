const HeadlessBrowser = require('../tests/helpers/browser.js');
const { spawn } = require('child_process');
const path = require('path');

async function test() {
  const serverPath = path.resolve(__dirname, '../server.js');
  const serverProcess = spawn('node', [serverPath]);
  
  await new Promise(resolve => setTimeout(resolve, 2000));

  const browser = new HeadlessBrowser();
  await browser.launch();
  try {
    await browser.navigate(`http://localhost:3000`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    await browser.evaluate(`
      window.lastAlert = null;
      window.alert = function(msg) { window.lastAlert = msg; };
      
      document.getElementById("apiKeyInput").value = "dummy-key";
      
      window.buttonWasDisabled = false;
      document.getElementById("generateScenarioBtn").addEventListener("click", () => {
        setTimeout(() => {
          window.buttonWasDisabled = document.getElementById("generateScenarioBtn").disabled;
        }, 10);
      });
    `);
    
    await browser.evaluate(`document.getElementById("generateScenarioBtn").click();`);
    
    // Wait until it finishes (up to 10s)
    await browser.evaluate(`
      new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const btn = document.getElementById("generateScenarioBtn");
          if (!btn.disabled || window.lastAlert || attempts > 100) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      })
    `);
    
    const wasDisabled = await browser.evaluate(`window.buttonWasDisabled`);
    const alertMsg = await browser.evaluate(`window.lastAlert`);
    const val = await browser.evaluate(`document.getElementById("characterScenario").value`);
    
    console.log("Button was disabled shortly after click:", wasDisabled);
    console.log("Alert message:", alertMsg);
    console.log("Value:", val);
    
  } finally {
    await browser.cleanup();
    serverProcess.kill();
  }
}

test().catch(console.error);
