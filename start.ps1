#Requires -Version 5.1
<#
.SYNOPSIS
    AI Email Copilot — one-click native Windows setup & launch (no WSL, no Docker)

.DESCRIPTION
    Checks all prerequisites, installs dependencies, initialises the database,
    then starts the API server and the web frontend in separate terminal windows.

.PARAMETER Reset
    Drops all database tables and starts fresh.

.EXAMPLE
    .\start.ps1
    Normal start — installs deps and launches both servers.

.EXAMPLE
    .\start.ps1 -Reset
    Wipes the database and starts fresh.
#>

[CmdletBinding()]
param(
    [switch]$Reset
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Colour helpers ────────────────────────────────────────────────────────────
function Step  { param([string]$m) Write-Host "`n$m" -ForegroundColor Cyan }
function OK    { param([string]$m) Write-Host "  [OK]  $m" -ForegroundColor Green }
function Warn  { param([string]$m) Write-Host "  [!]   $m" -ForegroundColor Yellow }
function Fail  { param([string]$m) Write-Host "  [ERR] $m" -ForegroundColor Red; exit 1 }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  AI Email Copilot — Native Windows Setup" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor DarkGray
Write-Host ""

# ── Project root ──────────────────────────────────────────────────────────────
$Root = $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "pnpm-workspace.yaml"))) {
    Fail "Run this script from the project root (where pnpm-workspace.yaml lives)."
}
Set-Location $Root

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 1 — Node.js
# ─────────────────────────────────────────────────────────────────────────────
Step "1/6  Checking Node.js (>= 18 required)"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Warn "Node.js is not installed."
    Write-Host "  Download the LTS installer from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "  Or install via winget:" -ForegroundColor Yellow
    Write-Host "    winget install OpenJS.NodeJS.LTS" -ForegroundColor DarkGray
    Write-Host ""
    Fail "Install Node.js >= 18 and re-run this script."
}

$nodeVer = node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>&1
if ($LASTEXITCODE -ne 0) {
    Fail "Node.js $(node --version) is too old. Please install v18 or newer."
}
OK "Node.js $(node --version)"

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 2 — pnpm
# ─────────────────────────────────────────────────────────────────────────────
Step "2/6  Checking pnpm"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Warn "pnpm not found — installing globally via npm..."
    npm install -g pnpm@latest
    if ($LASTEXITCODE -ne 0) { Fail "Failed to install pnpm." }
}
OK "pnpm $(pnpm --version)"

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 3 — PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────
Step "3/6  Checking PostgreSQL"

$psqlFound = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlFound) {
    # Try common install locations
    $pgPaths = @(
        "C:\Program Files\PostgreSQL\17\bin",
        "C:\Program Files\PostgreSQL\16\bin",
        "C:\Program Files\PostgreSQL\15\bin",
        "C:\Program Files\PostgreSQL\14\bin"
    )
    foreach ($p in $pgPaths) {
        if (Test-Path "$p\psql.exe") {
            $env:PATH = "$p;$env:PATH"
            $psqlFound = $true
            OK "Found PostgreSQL at $p"
            break
        }
    }
}

if (-not $psqlFound) {
    Write-Host ""
    Warn "PostgreSQL is not installed or psql is not in PATH."
    Write-Host "  Install PostgreSQL 16 (Windows x64):" -ForegroundColor Yellow
    Write-Host "    https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor DarkGray
    Write-Host "  Or via winget:" -ForegroundColor Yellow
    Write-Host "    winget install PostgreSQL.PostgreSQL.16" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  During install, set password for the 'postgres' user." -ForegroundColor Yellow
    Write-Host "  After install, add PostgreSQL\16\bin to your PATH." -ForegroundColor Yellow
    Write-Host ""
    Fail "Install PostgreSQL and re-run this script."
}

OK "PostgreSQL (psql $(psql --version 2>&1 | Select-String '\d+\.\d+' | ForEach-Object { $_.Matches[0].Value }))"

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 4 — Environment file
# ─────────────────────────────────────────────────────────────────────────────
Step "4/6  Setting up environment (.env)"

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Warn ".env created from .env.example"
        Write-Host ""
        Write-Host "  Open .env in Notepad (or VS Code) and fill in:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "    DATABASE_URL       — e.g. postgresql://postgres:yourpassword@localhost:5432/email_copilot" -ForegroundColor White
        Write-Host "    SESSION_SECRET     — run in PowerShell: -join ((1..32) | % { '{0:x}' -f (Get-Random -Max 256) })" -ForegroundColor White
        Write-Host "    GOOGLE_CLIENT_ID   — from https://console.cloud.google.com/" -ForegroundColor White
        Write-Host "    GOOGLE_CLIENT_SECRET" -ForegroundColor White
        Write-Host "    GROQ_API_KEY       — free at https://console.groq.com/ (fastest AI)" -ForegroundColor White
        Write-Host ""
        Write-Host "  Quick SESSION_SECRET generator — run this in a new PowerShell window:" -ForegroundColor DarkGray
        Write-Host "  [System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','')" -ForegroundColor DarkGray
        Write-Host ""
        Start-Process notepad ".env"
        Read-Host "  Press ENTER when .env is saved and ready"
    } else {
        Fail ".env.example not found. Make sure you are in the correct project folder."
    }
} else {
    OK ".env found"
}

# Load .env into current process environment
Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $k = $Matches[1].Trim()
        $v = $Matches[2].Trim().Trim('"').Trim("'")
        if ($k -and -not [System.Environment]::GetEnvironmentVariable($k)) {
            [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
        }
    }
}

$dbUrl = [System.Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
if (-not $dbUrl) {
    Fail "DATABASE_URL is not set in .env"
}

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 5 — pnpm install
# ─────────────────────────────────────────────────────────────────────────────
Step "5/6  Installing dependencies (pnpm install)"

pnpm install
if ($LASTEXITCODE -ne 0) { Fail "pnpm install failed." }
OK "Dependencies installed"

# ─────────────────────────────────────────────────────────────────────────────
#  STEP 6 — Database initialisation
# ─────────────────────────────────────────────────────────────────────────────
Step "6/6  Setting up database"

# Parse DATABASE_URL: postgresql://user:pass@host:port/dbname
if ($dbUrl -match '^postgresql://([^:]+):([^@]*)@([^:/]+):?(\d*)/(.+)$') {
    $dbUser = $Matches[1]
    $dbPass = $Matches[2]
    $dbHost = $Matches[3]
    $dbPort = if ($Matches[4]) { $Matches[4] } else { "5432" }
    $dbName = $Matches[5]
} else {
    Warn "Could not parse DATABASE_URL — skipping auto database setup."
    Warn "Run the SQL files in docker\init\ manually against your database."
    $dbUser = $null
}

if ($dbUser) {
    $env:PGPASSWORD = $dbPass

    # Create database if it doesn't exist
    $dbExists = psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc `
        "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>$null
    if ($dbExists -ne "1") {
        Write-Host "  Creating database '$dbName'..." -ForegroundColor DarkGray
        psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "CREATE DATABASE `"$dbName`";" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Warn "Could not create database. Make sure PostgreSQL is running and the password in .env is correct."
        }
    }

    if ($Reset.IsPresent) {
        Warn "Reset mode — dropping all tables in '$dbName'"
        psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -c `
            "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1 | Out-Null
    }

    # Check if tables already exist
    $tableCount = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -tAc `
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>$null
    $tableCount = [int]($tableCount -replace '\D', '0')

    if ($tableCount -eq 0) {
        Write-Host "  Running SQL initialisation scripts..." -ForegroundColor DarkGray
        $sqlDir = Join-Path $Root "docker\init"
        if (Test-Path $sqlDir) {
            Get-ChildItem $sqlDir -Filter "*.sql" | Sort-Object Name | ForEach-Object {
                Write-Host "    Applying: $($_.Name)" -ForegroundColor DarkGray
                psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $_.FullName -q 2>&1 | Out-Null
            }
            OK "Database schema created"
        } else {
            Warn "docker\init\ not found — skipping SQL setup. Run init scripts manually."
        }
    } else {
        # Count emails
        $emailCount = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -tAc `
            "SELECT COUNT(*) FROM emails" 2>$null
        $emailCount = ($emailCount -replace '\D', '?').Trim()
        OK "Database ready ($emailCount emails)"
    }

    Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
}

# ─────────────────────────────────────────────────────────────────────────────
#  Launch servers
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Starting servers..." -ForegroundColor Cyan
Write-Host "  API  ->  http://localhost:3001" -ForegroundColor White
Write-Host "  Web  ->  http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "  Two terminal windows will open — one for each server." -ForegroundColor DarkGray
Write-Host "  Close those windows (or press Ctrl+C inside them) to stop." -ForegroundColor DarkGray
Write-Host ""

# Read .env content to pass into child windows
$envBlock = Get-Content ".env" | Where-Object { $_ -match '^\s*[^#].*=.*' } |
    ForEach-Object {
        if ($_ -match '^\s*([^=]+)=(.*)$') {
            '$env:{0} = ''{1}''' -f $Matches[1].Trim(), $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
$envSetup = $envBlock -join "; "

# API Server window
$apiCmd = "$envSetup; `$env:PORT = '3001'; `$env:NODE_ENV = 'development'; " +
    "Write-Host '  [API] starting...' -ForegroundColor Cyan; " +
    "Set-Location '$Root\artifacts\api-server'; pnpm run dev"

Start-Process pwsh -ArgumentList "-NoExit", "-Command", $apiCmd `
    -WindowStyle Normal

# Wait briefly so the API port is likely bound before the frontend starts
Start-Sleep -Seconds 2

# Frontend window
$webCmd = "$envSetup; `$env:PORT = '5173'; " +
    "Write-Host '  [WEB] starting...' -ForegroundColor Cyan; " +
    "Set-Location '$Root\artifacts\email-copilot'; pnpm run dev"

Start-Process pwsh -ArgumentList "-NoExit", "-Command", $webCmd `
    -WindowStyle Normal

# Open browser after a short wait
Start-Sleep -Seconds 5
Start-Process "http://localhost:5173"

Write-Host "  Browser opening at http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "  To stop:  close the two terminal windows that just opened." -ForegroundColor DarkGray
Write-Host ""
