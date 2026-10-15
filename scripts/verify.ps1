$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
docker compose run --rm backend python -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
docker compose run --rm --no-deps vision python -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'Vision tests failed' }
docker compose build frontend
if ($LASTEXITCODE -ne 0) { throw 'Frontend checks failed' }
