const { execSync } = require('child_process');
const currentPid = process.pid;
console.log('Current PID:', currentPid);

try {
  if (process.platform === 'win32') {
    const output = execSync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'node.exe\'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"').toString().trim();
    if (output) {
      const processes = JSON.parse(output);
      const procList = Array.isArray(processes) ? processes : [processes];
      for (let proc of procList) {
        if (!proc || !proc.ProcessId) continue;
        const pid = proc.ProcessId;
        if (pid !== currentPid) {
          console.log('Killing PID:', pid, 'Cmd:', proc.CommandLine);
          try {
            process.kill(pid, 9);
          } catch (e) {
            // ignore
          }
        }
      }
    }
  } else {
    try {
      execSync(`pkill -9 -f "node.*(server\\.js|runner\\.js)" 2>/dev/null || true`);
      console.log('Cleaned up stray node server/runner processes on Linux.');
    } catch (e) {
      // ignore
    }
  }
} catch (e) {
  console.log('Error:', e.message);
}
