# Start All 4 Microservices (Gateway + User + Video + Interaction) Together
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$services = @(
  @{ Name = "user-service";        Dir = Join-Path $root "user-service";        Cmd = "node server.js" },
  @{ Name = "video-service";       Dir = Join-Path $root "video-service";       Cmd = "node src/app.js" },
  @{ Name = "interaction-service"; Dir = Join-Path $root "interaction-service"; Cmd = "node server.js" },
  @{ Name = "gateway";             Dir = Join-Path $root "gateway";             Cmd = "node server.js" }
)

Write-Host "Starting StreamMesh SOA Microservices..." -ForegroundColor Cyan
$procs = @()

foreach ($svc in $services) {
  Write-Host "  -> Launching $($svc.Name)..." -ForegroundColor Yellow
  $p = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit","-Command","Set-Location '$($svc.Dir)'; $($svc.Cmd)" -PassThru
  $procs += $p
}

Write-Host ""
Write-Host "All services launched!" -ForegroundColor Green
Write-Host "  Demo Console (REST + Wire Inspector): http://localhost:3001/demo" -ForegroundColor Cyan
Write-Host "  Apollo GraphQL Sandbox:               http://localhost:4000/" -ForegroundColor Cyan
Write-Host "  Close the spawned PowerShell windows when finished." -ForegroundColor DarkGray
