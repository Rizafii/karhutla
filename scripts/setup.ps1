param([switch]$SkipAssets)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.env')) {
    $configuration = Get-Content -LiteralPath '.env.example' -Raw
    $serviceToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $configuration = $configuration.Replace('replace-with-a-random-local-token', $serviceToken)
    Set-Content -LiteralPath '.env' -Value $configuration -Encoding ascii
}
docker compose build
if ($LASTEXITCODE -ne 0) { throw 'Docker build failed' }
if (-not $SkipAssets) {
    docker compose run --rm --no-deps -v "${projectRoot}:/workspace" backend python /workspace/scripts/fetch_assets.py
    if ($LASTEXITCODE -ne 0) { throw 'Asset download failed; downloads can be resumed by rerunning setup' }
    docker compose run --rm --no-deps -v "${projectRoot}/assets:/assets" vision python -m vision.prepare
    if ($LASTEXITCODE -ne 0) { throw 'Footage preparation failed' }
}
docker compose up -d --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Startup failed; inspect docker compose logs' }
Write-Output 'Command Center: http://localhost:3000'
Write-Output 'API documentation: http://localhost:8000/docs'
