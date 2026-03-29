#Requires -Version 5.1
<#
.SYNOPSIS
    AI Email Copilot — Windows PowerShell deployment helper

.DESCRIPTION
    Equivalent to docker/deploy.sh for users who prefer to stay in PowerShell
    rather than WSL2. Requires Docker Desktop with WSL2 backend and Docker
    Compose V2 (docker compose — no hyphen).

.PARAMETER gpu
    Start in GPU mode: enables vLLM (CUDA) and GPU-accelerated Ollama.
    Requires the NVIDIA Container Toolkit to be installed in WSL2.

.PARAMETER down
    Stop all containers (data volumes are preserved).

.PARAMETER logs
    Tail logs from all running containers (Ctrl+C to stop).

.PARAMETER status
    Show current container health and uptime.

.PARAMETER build
    Rebuild all Docker images before starting.

.PARAMETER pull
    Pull the latest base images from Docker Hub.

.EXAMPLE
    .\deploy.ps1
    Start in CPU mode (Ollama fallback).

.EXAMPLE
    .\deploy.ps1 -gpu
    Start in GPU mode (vLLM + Ollama + CUDA). Both -gpu and --gpu are accepted.

.EXAMPLE
    .\deploy.ps1 -down
    Stop everything. Both -down and --down are accepted.

.EXAMPLE
    .\deploy.ps1 -logs
    Tail all container logs.

.EXAMPLE
    .\deploy.ps1 -status
    Show container health.

.LINK
    WINDOWS_SETUP.md
#>

[CmdletBinding()]
param(
    [switch]$gpu,
    [switch]$down,
    [switch]$logs,
    [switch]$status,
    [switch]$build,
    [switch]$pull
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "  OK  $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  WARN  $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  ERR  $Message" -ForegroundColor Red
}

# ── Ensure we are in the project root ────────────────────────────────────────

$projectRoot = $PSScriptRoot
if (-not (Test-Path (Join-Path $projectRoot "docker-compose.yml"))) {
    Write-Fail "docker-compose.yml not found in $projectRoot"
    Write-Host "  Run this script from the project root directory." -ForegroundColor Yellow
    exit 1
}

Set-Location $projectRoot

# ── Check Docker is available ─────────────────────────────────────────────────

try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
}
catch {
    Write-Fail "Docker is not running or not installed."
    Write-Host "  Install Docker Desktop from https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Write-Host "  Then start Docker Desktop and try again." -ForegroundColor Yellow
    exit 1
}

# ── Check Docker Compose V2 ───────────────────────────────────────────────────

try {
    $composeVersion = docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "compose not found" }
}
catch {
    Write-Fail "Docker Compose V2 not found ('docker compose' — no hyphen)."
    Write-Host "  Update Docker Desktop to the latest version to get Compose V2." -ForegroundColor Yellow
    exit 1
}

# ── Determine command ─────────────────────────────────────────────────────────

$composeCmd = "up -d"
if ($down)   { $composeCmd = "down" }
elseif ($logs)   { $composeCmd = "logs -f --tail=100" }
elseif ($status) { $composeCmd = "ps" }
elseif ($pull)   { $composeCmd = "pull" }
elseif ($build)  { $composeCmd = "up -d --build" }

# ── Ensure .env exists (unless tearing down) ─────────────────────────────────

if ((-not $down) -and (-not (Test-Path ".env"))) {
    Write-Warn "No .env file found. Copying from .env.docker..."
    Copy-Item ".env.docker" ".env"
    Write-Host ""
    Write-Host "  Edit .env and set your secrets, then re-run this script." -ForegroundColor Yellow
    Write-Host "  Required: SESSION_SECRET, GOOGLE_CLIENT_SECRET" -ForegroundColor Yellow
    Write-Host "  Optional: OPENAI_API_KEY, HF_TOKEN" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── GPU mode checks ───────────────────────────────────────────────────────────

$useGpu = $gpu.IsPresent

if ($useGpu) {
    $dockerInfo = docker info 2>&1 | Out-String
    if ($dockerInfo -notmatch "nvidia") {
        Write-Warn "NVIDIA Container Toolkit not detected in Docker."
        Write-Host "  To enable GPU mode:" -ForegroundColor Yellow
        Write-Host "    1. Open your Ubuntu (WSL2) terminal." -ForegroundColor Yellow
        Write-Host "    2. Follow Step 4b in WINDOWS_SETUP.md to install the toolkit." -ForegroundColor Yellow
        Write-Host "    3. Restart Docker Desktop." -ForegroundColor Yellow
        Write-Host "  Falling back to CPU mode..." -ForegroundColor Yellow
        $useGpu = $false
    }
}

# ── Build compose file list ───────────────────────────────────────────────────

$composeFiles = @("-f", "docker-compose.yml")
if ($useGpu) {
    $composeFiles += @("-f", "docker-compose.gpu.yml")
    Write-Header "Starting in GPU mode (vLLM + Ollama + CUDA)..."
}
elseif (-not $down -and -not $status -and -not $logs -and -not $pull) {
    Write-Header "Starting in CPU mode (Ollama fallback)..."
}

# ── Run docker compose ────────────────────────────────────────────────────────

$composeCmdArgs = $composeFiles + ($composeCmd -split " ")

Write-Host "  Running: docker compose $($composeCmdArgs -join ' ')" -ForegroundColor DarkGray
Write-Host ""

& docker compose @composeCmdArgs

if ($LASTEXITCODE -ne 0) {
    Write-Fail "docker compose exited with code $LASTEXITCODE."
    exit $LASTEXITCODE
}

# ── Print service URLs after a successful start ───────────────────────────────

if ($composeCmd -eq "up -d" -or $composeCmd -eq "up -d --build") {
    Write-Host ""
    Write-Success "Services starting..."
    Write-Host ""
    Write-Host "  Frontend:   http://localhost        (nginx reverse proxy)" -ForegroundColor White
    Write-Host "  Frontend:   http://localhost:3000   (direct)" -ForegroundColor White
    Write-Host "  API:        http://localhost:8080" -ForegroundColor White
    Write-Host "  Ollama:     http://localhost:11434" -ForegroundColor White
    if ($useGpu) {
        Write-Host "  vLLM:       http://localhost:8000" -ForegroundColor White
    }
    Write-Host "  Postgres:   localhost:5432" -ForegroundColor White
    Write-Host "  Redis:      localhost:6379" -ForegroundColor White
    Write-Host ""
    Write-Host "  AI Status:  http://localhost:8080/api/ai/status" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  First boot: Docker is building images + pulling models (~10-20 min)." -ForegroundColor DarkGray
    Write-Host "  Tail logs:  .\deploy.ps1 --logs" -ForegroundColor DarkGray
    Write-Host "  Check health: .\deploy.ps1 --status" -ForegroundColor DarkGray
    Write-Host ""
}
