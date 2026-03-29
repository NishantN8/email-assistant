#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AI Email Copilot — one-click local setup & launch
#  Usage:  bash start.sh
#          bash start.sh --docker       (full GPU stack via Docker Compose)
#          bash start.sh --reset        (drop DB data and start fresh)
# ─────────────────────────────────────────────────────────────────────────────
set -e
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
step() { echo -e "\n${BOLD}$*${NC}"; }

DOCKER_MODE=false
RESET_MODE=false
for arg in "$@"; do
  case $arg in
    --docker) DOCKER_MODE=true ;;
    --reset)  RESET_MODE=true  ;;
  esac
done

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       AI Email Copilot — Setup            ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── Docker mode ─────────────────────────────────────────────────────────────
if [ "$DOCKER_MODE" = true ]; then
  step "Docker mode — checking requirements"

  if ! command -v docker &>/dev/null; then
    err "Docker is not installed. Get it from https://docs.docker.com/get-docker/"
    exit 1
  fi
  if ! docker compose version &>/dev/null 2>&1; then
    err "Docker Compose v2 is required. Update Docker Desktop or install the plugin."
    exit 1
  fi
  log "Docker $(docker --version | awk '{print $3}' | tr -d ,) found"

  if [ ! -f .env ]; then
    warn ".env not found — copying from .env.example (fill in your API keys)"
    cp .env.example .env
  fi

  if [ "$RESET_MODE" = true ]; then
    warn "Reset mode — removing existing volumes"
    docker compose down -v --remove-orphans 2>/dev/null || true
  fi

  step "Starting full stack (Postgres + Redis + Ollama + API + Web)"
  echo "  GPU support: docker compose -f docker-compose.yml -f docker-compose.gpu.yml up"
  echo ""
  docker compose up --build

  exit 0
fi

# ── Local mode ───────────────────────────────────────────────────────────────
step "1/6  Checking Node.js (≥ 18 required)"
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install from https://nodejs.org/ (v18 LTS or newer)"
  exit 1
fi
NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null && echo ok || echo fail)
if [ "$NODE_VER" = "fail" ]; then
  err "Node.js $(node --version) is too old. Need v18+."
  exit 1
fi
log "Node.js $(node --version)"

step "2/6  Checking pnpm"
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing globally"
  npm install -g pnpm@latest
fi
log "pnpm $(pnpm --version)"

step "3/6  Checking PostgreSQL"
if ! command -v psql &>/dev/null; then
  warn "psql CLI not found — make sure PostgreSQL is running and DATABASE_URL is set in .env"
else
  log "psql $(psql --version | awk '{print $3}')"
fi

step "4/6  Setting up environment"
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env created from .env.example"
    echo ""
    echo "  Open .env and fill in:"
    echo "    DATABASE_URL        — your Postgres connection string"
    echo "    SESSION_SECRET      — run: openssl rand -hex 32"
    echo "    GOOGLE_CLIENT_ID    — from Google Cloud Console"
    echo "    GOOGLE_CLIENT_SECRET"
    echo "    At least one AI key — GROQ_API_KEY (free at console.groq.com)"
    echo ""
    read -r -p "  Press ENTER when .env is ready (or Ctrl+C to stop) ..."
  else
    err ".env.example not found — please create a .env file manually"
    exit 1
  fi
else
  log ".env found"
fi

# Load env so we can run db check
set -o allexport; source .env; set +o allexport 2>/dev/null || true

step "5/6  Installing dependencies"
pnpm install
log "Dependencies installed"

step "6/6  Setting up database"
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  err "DATABASE_URL is not set in .env"
  exit 1
fi

# Run SQL init files if tables don't exist yet
TABLES_EXIST=$(psql "$DB_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='emails'" 2>/dev/null || echo "0")
if [ "$TABLES_EXIST" = "0" ] || [ "$RESET_MODE" = true ]; then
  if [ "$RESET_MODE" = true ]; then
    warn "Reset mode — dropping all tables"
    psql "$DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
  fi
  log "Running database initialisation scripts"
  for sql_file in docker/init/*.sql; do
    [ -f "$sql_file" ] || continue
    psql "$DB_URL" -f "$sql_file" -q 2>/dev/null && log "  Applied: $sql_file" || warn "  Skipped: $sql_file (may already exist)"
  done
else
  log "Database already initialised ($(psql "$DB_URL" -tAc "SELECT COUNT(*) FROM emails" 2>/dev/null || echo "?") emails)"
fi

# ── Launch servers ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Starting servers...${NC}"
echo -e "  API  → ${GREEN}http://localhost:3001${NC}"
echo -e "  Web  → ${GREEN}http://localhost:5173${NC}"
echo ""
echo "  Press Ctrl+C to stop both servers"
echo ""

cleanup() {
  echo ""
  warn "Shutting down..."
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
  log "Stopped."
}
trap cleanup INT TERM

# API server
(cd artifacts/api-server && \
  PORT=3001 NODE_ENV=development pnpm run dev 2>&1 | sed 's/^/  [API] /') &
API_PID=$!

# Frontend
(cd artifacts/email-copilot && \
  PORT=5173 pnpm run dev 2>&1 | sed 's/^/  [WEB] /') &
WEB_PID=$!

# Open browser once frontend is ready
(sleep 6 && \
  if command -v xdg-open &>/dev/null; then xdg-open "http://localhost:5173"
  elif command -v open &>/dev/null; then open "http://localhost:5173"
  fi) &

wait "$API_PID" "$WEB_PID"
