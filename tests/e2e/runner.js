const fs = require('fs');
const path = require('path');
const { run } = require('node:test');
const { startServer } = require('../helpers/server.js');
const HeadlessBrowser = require('../helpers/browser.js');

async function main() {
  console.log('[runner] Starting E2E test suite...');
  
  let serverInstance = null;
  let browserInstance = null;
  let exitCode = 0;

  try {
    // 1. Start Server
    serverInstance = await startServer();
    console.log('[runner] Server started successfully.');

    // 2. Start Headless Chrome
    browserInstance = new HeadlessBrowser();
    await browserInstance.launch();
    console.log('[runner] Chrome started and connected.');

    // 3. Find test files
    const e2eDir = __dirname;
    const testFiles = fs.readdirSync(e2eDir)
      .filter(file => file.endsWith('.test.js'))
      .map(file => path.join(e2eDir, file));

    if (testFiles.length === 0) {
      console.warn('[runner] No test files found.');
      // Write empty results
      const results = {
        summary: { total: 0, passed: 0, failed: 0 },
        tests: []
      };
      fs.writeFileSync(path.join(e2eDir, 'results.json'), JSON.stringify(results, null, 2));
      return;
    }

    console.log(`[runner] Found ${testFiles.length} test files to run:`);
    testFiles.forEach(f => console.log(`  - ${path.basename(f)}`));

    // 4. Run tests programmatically
    const tests = [];
    let passCount = 0;
    let failCount = 0;

    const testStream = run({
      files: testFiles
    });
    testStream.resume();

    testStream.on('test:start', (data) => {
      console.log(`[test:start] ${data.name}`);
    });

    testStream.on('test:pass', (data) => {
      passCount++;
      tests.push({
        name: data.name,
        status: 'passed',
        duration_ms: data.details.duration_ms
      });
      console.log(`[test:pass] ✓ ${data.name} (${data.details.duration_ms.toFixed(1)}ms)`);
    });

    testStream.on('test:fail', (data) => {
      failCount++;
      const errMsg = data.details.error ? (data.details.error.message || String(data.details.error)) : 'Unknown error';
      tests.push({
        name: data.name,
        status: 'failed',
        error: errMsg,
        duration_ms: data.details.duration_ms
      });
      console.error(`[test:fail] ✗ ${data.name} (${data.details.duration_ms.toFixed(1)}ms)`);
      if (data.details.error && data.details.error.stack) {
        console.error(data.details.error.stack);
      } else {
        console.error(`  Error: ${errMsg}`);
      }
      exitCode = 1;
    });

    // Wait for tests to finish
    await new Promise((resolve) => {
      testStream.on('end', resolve);
    });

    // 5. Write results
    const results = {
      summary: {
        total: passCount + failCount,
        passed: passCount,
        failed: failCount
      },
      tests
    };
    const resultsPath = path.join(e2eDir, 'results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`[runner] Wrote test results to ${resultsPath}`);
    console.log(`[runner] Summary: ${passCount} passed, ${failCount} failed.`);

  } catch (err) {
    console.error('[runner] Fatal error during test execution:', err);
    exitCode = 1;
  } finally {
    // 6. Cleanup
    console.log('[runner] Cleaning up services...');
    if (browserInstance) {
      try {
        await browserInstance.cleanup();
      } catch (err) {
        console.error('[runner] Error cleaning up browser:', err);
      }
    }
    if (serverInstance) {
      try {
        await serverInstance.stop();
      } catch (err) {
        console.error('[runner] Error stopping server:', err);
      }
    }
    console.log(`[runner] Exiting with code ${exitCode}`);
    process.exit(exitCode);
  }
}

main();
