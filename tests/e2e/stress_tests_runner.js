const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Helper to kill a process group on Windows or standard kill on Unix
function killProcess(pid) {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
    } catch (err) {
      // Ignore
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (err) {
      // Ignore
    }
  }
}

async function runScenario1() {
  console.log('\n--- Scenario 1: Port 3000 Conflict ---');
  // 1. Occupy port 3000
  console.log('[Scenario 1] Starting dummy server on port 3000...');
  const dummyServer = net.createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n\r\n');
    socket.end();
  });
  await new Promise(resolve => dummyServer.listen(3000, resolve));
  console.log('[Scenario 1] Port 3000 is now occupied.');

  // 2. Run the runner.js
  console.log('[Scenario 1] Spawning node tests/e2e/runner.js...');
  const runner = spawn('node', [path.join(__dirname, 'runner.js')]);
  let runnerStdout = '';
  let runnerStderr = '';

  runner.stdout.on('data', (d) => { runnerStdout += d.toString(); });
  runner.stderr.on('data', (d) => { runnerStderr += d.toString(); });

  const exitCode = await new Promise((resolve) => {
    runner.on('close', resolve);
  });

  console.log(`[Scenario 1] Runner exited with code: ${exitCode}`);
  console.log('[Scenario 1] Runner Stdout snippet:\n', runnerStdout.trim().split('\n').map(l => '  ' + l).join('\n'));
  if (runnerStderr) {
    console.log('[Scenario 1] Runner Stderr:\n', runnerStderr.trim().split('\n').map(l => '  ' + l).join('\n'));
  }

  // 3. Cleanup dummy server
  await new Promise(resolve => dummyServer.close(resolve));
  console.log('[Scenario 1] Dummy server stopped.');

  // 4. Verify no stray node server.js or chrome processes are running from this runner instance
  const serverPortOccupied = await isPortInUse(3000);
  const chromePortOccupied = await isPortInUse(9222);
  console.log(`[Scenario 1] Post-run check: port 3000 occupied? ${serverPortOccupied}; port 9222 occupied? ${chromePortOccupied}`);

  const passed = exitCode === 1 && !serverPortOccupied;
  console.log(`[Scenario 1] RESULT: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

async function runScenario2() {
  console.log('\n--- Scenario 2: Server Process Crash During Test ---');
  // We will run tests/e2e/runner.js but we will hook into its output to kill the server when we see it started
  console.log('[Scenario 2] Spawning runner...');
  const runner = spawn('node', [path.join(__dirname, 'runner.js')]);
  let runnerStdout = '';
  let runnerStderr = '';
  let killedServer = false;

  runner.stdout.on('data', (d) => {
    const out = d.toString();
    runnerStdout += out;
    if (out.includes('[runner] Server started successfully') && !killedServer) {
      killedServer = true;
      console.log('[Scenario 2] Server started detected. Finding server PID and killing it...');
      
      // Since server is a child of runner, on Windows we can find node server.js processes or kill it.
      // We will search netstat or query by process.
      try {
        let pidToKill;
        if (process.platform === 'win32') {
          const output = execSync('netstat -ano').toString();
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes(':3000') && line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/);
              pidToKill = parts[parts.length - 1];
              break;
            }
          }
        } else {
          const output = execSync('lsof -i :3000 -t').toString();
          pidToKill = output.trim();
        }
        if (pidToKill) {
          console.log(`[Scenario 2] Found server PID: ${pidToKill}. Killing it...`);
          killProcess(pidToKill);
        } else {
          console.log('[Scenario 2] Could not find server PID listening on port 3000!');
        }
      } catch (err) {
        console.error('[Scenario 2] Error finding/killing server PID:', err.message);
      }
    }
  });

  runner.stderr.on('data', (d) => { runnerStderr += d.toString(); });

  const exitCode = await new Promise((resolve) => {
    runner.on('close', resolve);
  });

  console.log(`[Scenario 2] Runner exited with code: ${exitCode}`);
  console.log('[Scenario 2] Runner Stdout snippet:\n', runnerStdout.trim().split('\n').map(l => '  ' + l).join('\n'));
  if (runnerStderr) {
    console.log('[Scenario 2] Runner Stderr:\n', runnerStderr.trim().split('\n').map(l => '  ' + l).join('\n'));
  }

  const serverPortOccupied = await isPortInUse(3000);
  const chromePortOccupied = await isPortInUse(9222);
  console.log(`[Scenario 2] Post-run check: port 3000 occupied? ${serverPortOccupied}; port 9222 occupied? ${chromePortOccupied}`);

  const passed = exitCode === 1 && !serverPortOccupied && !chromePortOccupied;
  console.log(`[Scenario 2] RESULT: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

async function runScenario3() {
  console.log('\n--- Scenario 3: Chrome Process Crash During Test ---');
  console.log('[Scenario 3] Spawning runner...');
  const runner = spawn('node', [path.join(__dirname, 'runner.js')]);
  let runnerStdout = '';
  let runnerStderr = '';
  let killedChrome = false;

  runner.stdout.on('data', (d) => {
    const out = d.toString();
    runnerStdout += out;
    if (out.includes('[runner] Chrome started and connected') && !killedChrome) {
      killedChrome = true;
      console.log('[Scenario 3] Chrome started detected. Finding Chrome PID and killing it...');
      try {
        let pidToKill;
        if (process.platform === 'win32') {
          const output = execSync('netstat -ano').toString();
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.includes(':9222') && line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/);
              pidToKill = parts[parts.length - 1];
              break;
            }
          }
        } else {
          const output = execSync('lsof -i :9222 -t').toString();
          pidToKill = output.trim();
        }
        if (pidToKill) {
          console.log(`[Scenario 3] Found Chrome PID: ${pidToKill}. Killing it...`);
          killProcess(pidToKill);
        } else {
          console.log('[Scenario 3] Could not find Chrome PID listening on port 9222!');
        }
      } catch (err) {
        console.error('[Scenario 3] Error finding/killing Chrome PID:', err.message);
      }
    }
  });

  runner.stderr.on('data', (d) => { runnerStderr += d.toString(); });

  const exitCode = await new Promise((resolve) => {
    runner.on('close', resolve);
  });

  console.log(`[Scenario 3] Runner exited with code: ${exitCode}`);
  console.log('[Scenario 3] Runner Stdout snippet:\n', runnerStdout.trim().split('\n').map(l => '  ' + l).join('\n'));
  if (runnerStderr) {
    console.log('[Scenario 3] Runner Stderr:\n', runnerStderr.trim().split('\n').map(l => '  ' + l).join('\n'));
  }

  const serverPortOccupied = await isPortInUse(3000);
  const chromePortOccupied = await isPortInUse(9222);
  console.log(`[Scenario 3] Post-run check: port 3000 occupied? ${serverPortOccupied}; port 9222 occupied? ${chromePortOccupied}`);

  const passed = exitCode === 1 && !serverPortOccupied && !chromePortOccupied;
  console.log(`[Scenario 3] RESULT: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

async function main() {
  console.log('=== Starting E2E Framework Stress Tests ===');
  
  const results = {};
  results.scenario1 = await runScenario1();
  results.scenario2 = await runScenario2();
  results.scenario3 = await runScenario3();

  console.log('\n=== Stress Test Summary ===');
  console.log(`Scenario 1 (Port 3000 Conflict): ${results.scenario1 ? 'PASSED' : 'FAILED'}`);
  console.log(`Scenario 2 (Server Crash):        ${results.scenario2 ? 'PASSED' : 'FAILED'}`);
  console.log(`Scenario 3 (Chrome Crash):        ${results.scenario3 ? 'PASSED' : 'FAILED'}`);

  const allPassed = Object.values(results).every(v => v === true);
  process.exit(allPassed ? 0 : 1);
}

main();
