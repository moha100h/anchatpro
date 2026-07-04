#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  AnymsChatBot — Update Script
#  Usage: bash update.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
info() { echo -e "${CYAN}ℹ  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}"
echo "═══════════════════════════════════════════════════"
echo "   🔄 AnymsChatBot — Update"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"

# ─── Load .env ────────────────────────────────────────────────────────────────
ENV_FILE="${SCRIPT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
    set -o allexport
    source "$ENV_FILE"
    set +o allexport
    ok ".env loaded"
else
    die ".env file not found at ${ENV_FILE}. Run install.sh first."
fi

# ─── Step 1: Git pull ─────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 1 — Pull latest code${NC}"
git pull
ok "Code updated"

# ─── Step 2: Install dependencies ─────────────────────────────────────────────
echo -e "\n${BOLD}Step 2 — Install dependencies${NC}"
pnpm install
ok "Dependencies installed"

# ─── Step 3: Push DB schema ───────────────────────────────────────────────────
echo -e "\n${BOLD}Step 3 — Update database schema${NC}"
info "Pushing schema changes..."
pnpm --filter @workspace/db run push-force 2>&1 | tail -5 || \
    pnpm --filter @workspace/db run push 2>&1 | tail -5 || \
    warn "Schema push failed — continuing. Check DB connection."
ok "Database schema up to date"

# ─── Step 4: Build ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 4 — Build${NC}"
pnpm --filter @workspace/api-server run build
ok "Build complete"

# ─── Step 5: Restart PM2 ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 5 — Restart bot${NC}"
if pm2 restart anchatbot 2>/dev/null; then
    ok "Bot restarted"
else
    warn "pm2 restart failed — trying pm2 reload..."
    pm2 reload anchatbot 2>/dev/null || die "Could not restart bot. Run: pm2 start 'pnpm --filter @workspace/api-server run start' --name anchatbot"
fi

# ─── Step 6: Health check ─────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 6 — Health check${NC}"
sleep 4
BOT_STATUS=$(pm2 show anchatbot 2>/dev/null | grep -E "status\s*[│|]" | awk '{print $NF}' | tr -d '│| ' || echo "unknown")
if [[ "$BOT_STATUS" == "online" ]]; then
    ok "Bot is ONLINE ✔"
else
    warn "Bot status: '${BOT_STATUS:-unknown}'"
    warn "Check logs: pm2 logs anchatbot --lines 30"
fi

echo ""
echo -e "${BOLD}${GREEN}"
echo "═══════════════════════════════════════════════════"
echo "   🎉 Update complete!"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"
echo "  pm2 logs anchatbot    — view live logs"
echo "  pm2 status            — view process status"
echo ""
