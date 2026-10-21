param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskUrl = 'http://127.0.0.1:4317/'
function Get-VaultHealth {
    try {
        $taskHealth = Invoke-RestMethod -Uri ($taskUrl + '__skillvault_health') -TimeoutSec 2
        return $taskHealth.app -eq 'skill-vault-local'
    } catch { return $false }
}
try {
    if (-not (Get-VaultHealth)) {
        $taskListener = Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue
        if ($taskListener) { throw 'Port 4317 is in use by another application. Please close it before starting Skill Vault.' }
        $taskNode = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
        if (-not $taskNode) {
            $taskBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
            if (Test-Path -LiteralPath $taskBundledNode) { $taskNode = $taskBundledNode }
        }
        if (-not $taskNode) { throw 'Node.js is missing. Install Node.js 22 or later, then open this launcher again.' }
        $taskServer = Join-Path $taskRoot 'server.mjs'
        Start-Process -FilePath $taskNode -ArgumentList @('"' + $taskServer + '"') -WorkingDirectory $taskRoot -WindowStyle Hidden
        $taskReady = $false
        for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
            if (Get-VaultHealth) { $taskReady = $true; break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $taskReady) { throw 'The local server did not start. Run node server.mjs in this folder to view the error.' }
    }
    if (-not $NoBrowser) { Start-Process $taskUrl }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
