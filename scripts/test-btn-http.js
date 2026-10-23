const HeadlessBrowser = require('../tests/helpers/browser.js');
const { spawn } = require('child_process');
const path = require('path');

async function test() {
  const serverPath = path.resolve(__dirname, '../server.js');
  const serverProcess = spawn('node', [serverPath]);
  
  await new Promise(resolve => setTimeout(resolve, 2000)); // wait for server to start

  const browser = new HeadlessBrowser();
  await browser.launch();
  try {
    await browser.navigate(`http://localhost:3000`);
    
    // Wait for the UI to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    await browser.evaluate(`
      window.lastAlert = null;
      window.alert = function(msg) { window.lastAlert = msg; };
      
      // Inject dummy API key so it doesn't alert and return early
      document.getElementById("apiKeyInput").value = "dummy-key";
      
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
    const alertMsg = await browser.evaluate(`window.lastAlert`);
    const btnText = await browser.evaluate(`document.getElementById("generateScenarioBtn").innerHTML`);
    
    console.log("Button was disabled shortly after click:", wasDisabled);
    console.log("Alert message:", alertMsg);
    console.log("Button text:", btnText);
    
  } finally {
    await browser.cleanup();
    serverProcess.kill();
  }
}

test().catch(console.error);
