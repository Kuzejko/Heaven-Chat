const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class HeadlessBrowser {
  constructor() {
    this.chromeProcess = null;
    this.ws = null;
    this.commandId = 1;
    this.pendingCommands = new Map();
    this.loadResolver = null;
    this.userDataDir = null;
  }

  async launch() {
    let chromePath = process.env.CHROME_PATH;
    if (!chromePath) {
      if (process.platform === 'win32') {
        chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (process.platform === 'darwin') {
        chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else {
        const candidates = [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium'
        ];
        chromePath = candidates.find(c => fs.existsSync(c)) || 'google-chrome';
      }
    }
    const port = 9222;

    // Use a unique user data directory for this run to avoid locks/collisions
    this.userDataDir = path.resolve(__dirname, `chrome-profile-${process.pid}`);
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }

    console.log(`[browser] Launching Chrome headlessly at port ${port}...`);
    this.chromeProcess = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--disable-gpu',
      '--no-sandbox',
      `--user-data-dir=${this.userDataDir}`
    ]);

    // Poll for the debugger HTTP endpoint to become active and get the target
    let pageTarget = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        if (res.ok) {
          const targets = await res.json();
          // Find the default page target
          pageTarget = targets.find(t => t.type === 'page');
          if (pageTarget && pageTarget.webSocketDebuggerUrl) {
            break;
          }
        }
      } catch (err) {
        // Wait for chrome to startup
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('Failed to find Chrome page target or remote debugging port is not available.');
    }

    console.log(`[browser] Connected to Chrome targets. WebSocket URL: ${pageTarget.webSocketDebuggerUrl}`);

    // Connect WebSocket
    this.ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id && this.pendingCommands.has(data.id)) {
          const { resolve, reject } = this.pendingCommands.get(data.id);
          this.pendingCommands.delete(data.id);
          if (data.error) {
            reject(new Error(data.error.message || JSON.stringify(data.error)));
          } else {
            resolve(data.result);
          }
        } else {
          this.handleEvent(data);
        }
      } catch (err) {
        console.error('[browser] Error parsing WebSocket message:', err);
      }
    };
  }

  async connect() {
    const port = 9222;
    let pageTarget = null;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        if (res.ok) {
          const targets = await res.json();
          pageTarget = targets.find(t => t.type === 'page');
          if (pageTarget && pageTarget.webSocketDebuggerUrl) {
            break;
          }
        }
      } catch (err) {
        // Wait
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('Failed to connect to running Chrome target');
    }

    this.ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.id && this.pendingCommands.has(data.id)) {
          const { resolve, reject } = this.pendingCommands.get(data.id);
          this.pendingCommands.delete(data.id);
          if (data.error) {
            reject(new Error(data.error.message || JSON.stringify(data.error)));
          } else {
            resolve(data.result);
          }
        } else {
          this.handleEvent(data);
        }
      } catch (err) {
        console.error('[browser] Error parsing WebSocket message:', err);
      }
    };
  }

  handleEvent(data) {
    if (data.method === 'Page.loadEventFired') {
      if (this.loadResolver) {
        this.loadResolver();
        this.loadResolver = null;
      }
    }
  }

  sendCommand(method, params = {}) {
    const id = this.commandId++;
    return new Promise((resolve, reject) => {
      this.pendingCommands.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url, timeoutMs = 15000) {
    let timeoutId;
    const loadPromise = new Promise((resolve, reject) => {
      this.loadResolver = resolve;
      timeoutId = setTimeout(() => {
        this.loadResolver = null;
        reject(new Error(`Navigation to ${url} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    await this.sendCommand('Page.enable');
    await this.sendCommand('Page.navigate', { url });
    await loadPromise;
    clearTimeout(timeoutId);
  }

  async evaluate(code) {
    const response = await this.sendCommand('Runtime.evaluate', {
      expression: code,
      returnByValue: true,
      awaitPromise: true
    });
    if (response.exceptionDetails) {
      const desc = response.exceptionDetails.exception ? response.exceptionDetails.exception.description : 'Unknown error';
      throw new Error(`Evaluation failed: ${desc}`);
    }
    return response.result.value;
  }

  async cleanup() {
    console.log('[browser] Cleaning up browser connection and processes...');
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    if (this.chromeProcess) {
      if (process.platform === 'win32') {
        try {
          const { execSync } = require('child_process');
          execSync(`taskkill /pid ${this.chromeProcess.pid} /f /t`);
        } catch (err) {
          // Ignore
        }
      } else {
        this.chromeProcess.kill('SIGKILL');
      }
    }
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch (err) {
        // May fail if some file is temporarily locked, ignore
      }
    }
  }
}

module.exports = HeadlessBrowser;
