const child_process = require('child_process');
const originalExec = child_process.exec;

// Override child_process.exec
child_process.exec = function (cmd, options, callback) {
  // Normalize arguments
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  const isBrowserOpenCmd = 
    cmd.startsWith('start ') || 
    cmd.startsWith('open ') || 
    cmd.startsWith('xdg-open ') || 
    cmd.includes('http://localhost');

  if (isBrowserOpenCmd) {
    console.log(`[mock-exec] Intercepted browser open command: ${cmd}`);
    if (callback) {
      process.nextTick(() => callback(null, '', ''));
    }
    // Return a dummy ChildProcess object
    const dummyProcess = {
      stdout: new (require('stream').Readable)({ read() {} }),
      stderr: new (require('stream').Readable)({ read() {} }),
      on: () => dummyProcess,
      once: () => dummyProcess,
      emit: () => true,
      kill: () => {},
    };
    dummyProcess.stdout.push(null);
    dummyProcess.stderr.push(null);
    return dummyProcess;
  }

  return originalExec.call(this, cmd, options, callback);
};

console.log('[mock-exec] child_process.exec has been successfully mocked.');
