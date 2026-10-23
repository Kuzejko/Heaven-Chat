Write-Host "Killing chrome processes..."
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Write-Host "Killing other node processes..."
$currentPid = $PID
$nodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
foreach ($n in $nodes) {
    $cmd = $n.CommandLine
    if ($cmd -match "runner.js" -or $cmd -match "server.js" -or $cmd -match "tier1.test.js" -or $cmd -match "tier2.test.js" -or $cmd -match "framework.test.js" -or $cmd -match "debug_runner.js" -or $cmd -match "run_tests_helper.js") {
        # Double check it is not run-tests-safely.js itself
        if ($cmd -notmatch "run-tests-safely.js") {
            Write-Host "Killing node PID $($n.ProcessId) ($cmd)"
            Stop-Process -Id $n.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}
