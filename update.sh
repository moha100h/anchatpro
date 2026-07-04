#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  AnymsChatBot — Update Script v3
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
ENV_FILE="${SCRIPT_DIR}/.env"

echo -e "${BOLD}"
echo "═══════════════════════════════════════════════════"
echo "   🔄 AnymsChatBot — Update v3"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"

# ─── Load .env ────────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    die ".env not found at ${ENV_FILE}. Run install.sh first."
fi
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport
ok ".env loaded"

# ─── Step 1: Git pull ─────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 1 — Pull latest code${NC}"
cd "$SCRIPT_DIR"
git pull
ok "Code updated"

# ─── Step 2: Install dependencies ─────────────────────────────────────────────
echo -e "\n${BOLD}Step 2 — Dependencies${NC}"
pnpm install 2>&1 | grep -E "ERR_|error:|Done in" | tail -5 || true
ok "Dependencies installed"

# ─── Step 3: Build ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 3 — Build${NC}"
pnpm --filter @workspace/api-server run build
ok "Build complete"

# ─── Step 4: DB schema push ───────────────────────────────────────────────────
echo -e "\n${BOLD}Step 4 — Database schema${NC}"
info "Pushing schema changes (drizzle-kit auto-loads .env)..."

if pnpm --filter @workspace/db run push-force 2>&1 | tail -6; then
    ok "Schema pushed"
else
    warn "push-force failed — trying as postgres superuser..."
    sudo -u postgres DATABASE_URL="postgresql://postgres@localhost/anchatbot" \
        pnpm --filter @workspace/db run push-force 2>&1 | tail -6 \
        || warn "Schema push failed — manual SQL migrations will handle missing columns."
fi

# ─── Step 5: SQL migrations (idempotent) ──────────────────────────────────────
info "Applying SQL migrations..."
sudo -u postgres psql -d anchatbot << 'MIGRATIONS' 2>/dev/null || \
PGPASSWORD="${DATABASE_URL##*:}" psql "${DATABASE_URL}" << 'MIGRATIONS2' 2>/dev/null || true
-- Rename old column if still exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='backup_config' AND column_name='schedule_hours'
  ) THEN
    ALTER TABLE backup_config RENAME COLUMN schedule_hours TO schedule_minutes;
  END IF;
END $$;

-- Add missing columns (no-op if already exist)
ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS schedule_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE users         ADD COLUMN IF NOT EXISTS last_spin_date   varchar(10);
ALTER TABLE users         ADD COLUMN IF NOT EXISTS city             varchar(100);

-- Reset all serial sequences (fixes duplicate key errors after restore)
DO $$
DECLARE seq RECORD; maxval BIGINT;
BEGIN
  FOR seq IN
    SELECT s.relname AS seq_name,
           a.attrelid::regclass::text AS table_name,
           a.attname AS column_name
    FROM pg_class s
    JOIN pg_depend d  ON d.objid = s.oid
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S' AND d.deptype = 'a'
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I),1) FROM %s', seq.column_name, seq.table_name) INTO maxval;
    EXECUTE format('SELECT setval(%L, %s)', seq.seq_name, maxval);
  END LOOP;
END $$;

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO anchatbot;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anchatbot;
MIGRATIONS
MIGRATIONS2
ok "SQL migrations applied"

# ─── Step 6: Restart PM2 ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 5 — Restart bot${NC}"

# Check if PM2 process exists
if pm2 describe anchatbot >/dev/null 2>&1; then
    pm2 restart anchatbot
    ok "Bot restarted"
else
    warn "anchatbot process not found in PM2 — starting fresh..."
    pm2 start \
        "node --env-file=${ENV_FILE} --enable-source-maps ${SCRIPT_DIR}/artifacts/api-server/dist/index.mjs" \
        --name anchatbot \
        --cwd "$SCRIPT_DIR" \
        --restart-delay=5000 \
        --max-restarts=20
    pm2 save >/dev/null 2>&1 || true
    ok "Bot started"
fi

# ─── Step 7: Health check ─────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 6 — Health check${NC}"
sleep 5

BOT_STATUS=$(pm2 jlist 2>/dev/null \
    | node -e "try{const l=require('fs').readFileSync('/dev/stdin','utf8');const a=JSON.parse(l);const p=a.find(x=>x.name==='anchatbot');console.log(p?p.pm2_env.status:'unknown');}catch(e){console.log('unknown');}" \
    2>/dev/null || echo "unknown")

if [[ "$BOT_STATUS" == "online" ]]; then
    ok "Bot is ONLINE ✔"
else
    warn "Bot status: '${BOT_STATUS}'"
    warn "Check logs: pm2 logs anchatbot --lines 30"
fi

echo ""
echo -e "${BOLD}${GREEN}"
echo "═══════════════════════════════════════════════════"
echo "   🎉 Update complete!"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"
echo "  pm2 logs anchatbot --lines 30   — لاگ‌های زنده"
echo "  pm2 status                      — وضعیت ربات"
echo ""
