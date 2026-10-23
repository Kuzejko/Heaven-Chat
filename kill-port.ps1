$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "Found connection on port 3000: $($conn.OwningProcess)"
    foreach ($c in $conn) {
        if ($c.OwningProcess -ne 0) {
            Write-Host "Killing process ID $($c.OwningProcess)"
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "No process found on port 3000"
}
