const { spawn } = require('child_process');
const path = require('path');

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.resolve(__dirname, '../../server.js');
    const mockExecPath = path.resolve(__dirname, 'mock-exec.js');

    console.log(`[server] Starting server at ${serverPath} preloading ${mockExecPath}`);
    const serverProcess = spawn('node', ['-r', mockExecPath, serverPath], {
      env: { ...process.env }
    });

    let resolved = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[server stdout] ${output.trim()}`);
      if (output.includes('Server is running at')) {
        if (!resolved) {
          resolved = true;
          resolve({
            process: serverProcess,
            stop: () => {
              return new Promise((res) => {
                if (serverProcess.killed) {
                  res();
                  return;
                }
                serverProcess.once('exit', () => {
                  res();
                });
                if (process.platform === 'win32') {
                  try {
                    const { execSync } = require('child_process');
                    execSync(`taskkill /pid ${serverProcess.pid} /f /t`);
                  } catch (err) {
                    // Ignore
                  }
                  res();
                } else {
                  serverProcess.kill('SIGTERM');
                }
              });
            }
          });
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[server stderr] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      console.error('[server error]', err);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    serverProcess.on('exit', (code) => {
      console.log(`[server exit] Server process exited with code ${code}`);
      if (!resolved) {
        resolved = true;
        reject(new Error(`Server exited prematurely with code ${code}`));
      }
    });
  });
}

module.exports = { startServer };
