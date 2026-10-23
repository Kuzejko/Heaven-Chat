const { execSync } = require('child_process');

function sleep(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function cleanup() {
  console.log('Running cleanup...');
  try {
    if (process.platform === 'win32') {
      execSync('powershell -File cleanup.ps1', { stdio: 'inherit' });
    } else {
      execSync('fuser -k 3000/tcp 2>/dev/null || (lsof -t -i:3000 | xargs -r kill -9 2>/dev/null) || true');
      execSync('pkill -9 -f "node.*(server\\.js|runner\\.js)" 2>/dev/null || true');
    }
  } catch (e) {
    console.log('Cleanup error:', e.message);
  }
}

for (let attempt = 1; attempt <= 4; attempt++) {
  console.log(`--- Attempt ${attempt} ---`);
  cleanup();
  // Wait 3 seconds for ports to release
  sleep(3);
  
  try {
    console.log('Starting E2E tests...');
    execSync('node tests/e2e/runner.js', { stdio: 'inherit' });
    console.log('E2E tests completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error(`Attempt ${attempt} failed:`, err.message);
    if (attempt < 4) {
      console.log('Waiting 10 seconds before next attempt...');
      sleep(10);
    }
  }
}

console.error('All E2E test attempts failed.');
process.exit(1);
