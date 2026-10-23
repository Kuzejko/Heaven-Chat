const { execSync } = require('child_process');
const currentPid = process.pid;
console.log('Current PID:', currentPid);

try {
  if (process.platform === 'win32') {
    const output = execSync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'node.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"').toString();
    const processes = JSON.parse(output);
    const procList = Array.isArray(processes) ? processes : [processes];
    for (let proc of procList) {
      if (!proc || !proc.CommandLine) continue;
      if (proc.CommandLine.includes('server.js') || proc.CommandLine.includes('runner.js') || proc.CommandLine.includes('run_one_test.js')) {
        const pid = proc.ProcessId;
        if (pid !== currentPid) {
          console.log('Killing stray node PID:', pid, 'Command:', proc.CommandLine);
          try {
            process.kill(pid, 9);
          } catch (e) {
            console.error('Failed to kill:', pid, e.message);
          }
        }
      }
    }
  } else {
    try {
      execSync(`pkill -9 -f "node.*(server\\.js|runner\\.js|run_one_test\\.js)" 2>/dev/null || true`);
      console.log('Cleaned up stray test/server node processes on Linux.');
    } catch (e) {}
  }
} catch (err) {
  console.error('Error listing/killing processes:', err.message);
}
