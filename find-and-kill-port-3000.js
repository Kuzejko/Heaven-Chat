const { execSync } = require('child_process');

try {
  if (process.platform === 'win32') {
    const output = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction Stop | Select-Object LocalPort, OwningProcess, State | ConvertTo-Json"').toString().trim();
    console.log('Port 3000 info:', output);
    if (output) {
      const data = JSON.parse(output);
      const list = Array.isArray(data) ? data : [data];
      for (let item of list) {
        if (item && item.OwningProcess) {
          console.log('Killing process on port 3000:', item.OwningProcess);
          try {
            execSync(`taskkill /pid ${item.OwningProcess} /f /t`);
          } catch (err) {
            console.log('Failed to kill PID:', item.OwningProcess, err.message);
          }
        }
      }
    }
  } else {
    try {
      execSync('fuser -k 3000/tcp 2>/dev/null || (lsof -t -i:3000 | xargs -r kill -9 2>/dev/null) || true');
      console.log('Port 3000 checked/freed.');
    } catch (err) {
      console.log('Error freeing port 3000:', err.message);
    }
  }
} catch (err) {
  console.log('No active connections on port 3000 or error:', err.message);
}
