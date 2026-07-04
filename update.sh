#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  AnymsChatBot — Update Script v3
#  Usage: bash update.sh   (from the install directory, as root)
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
ECOSYSTEM_FILE="${SCRIPT_DIR}/ecosystem.config.cjs"

echo -e "${BOLD}"
echo "═══════════════════════════════════════════════════"
echo "   🔄 AnymsChatBot — Update v3"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"

# ─── Load .env ────────────────────────────────────────────────────────────────
[ -f "$ENV_FILE" ] || die ".env not found at ${ENV_FILE}. Run install.sh first."
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport
ok ".env loaded"

# Parse DB connection from DATABASE_URL for psql commands
# Format: postgresql://user:pass@host:port/dbname
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+).*$|\1|')
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|' || echo "5432")
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')

# ─── Step 1: Git pull ─────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 1 — Pull latest code${NC}"
cd "$SCRIPT_DIR"
git pull
ok "Code updated"

# ─── Step 2: Install dependencies ─────────────────────────────────────────────
echo -e "\n${BOLD}Step 2 — Dependencies${NC}"
pnpm install 2>&1 | grep -E "ERR_|error:|Done in|packages are looking" | tail -8 || true
ok "Dependencies up to date"

# ─── Step 3: Build ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 3 — Build${NC}"
pnpm --filter @workspace/api-server run build
ok "Build complete"

# ─── Step 4: DB schema push ───────────────────────────────────────────────────
echo -e "\n${BOLD}Step 4 — Database schema${NC}"
info "Pushing schema (drizzle-kit auto-loads .env)..."

if pnpm --filter @workspace/db run push-force 2>&1 | tail -6; then
    ok "Schema pushed"
else
    warn "push-force failed — trying postgres superuser fallback..."
    sudo -u postgres \
        env DATABASE_URL="postgresql://postgres@/${DB_NAME}" \
        pnpm --filter @workspace/db run push-force 2>&1 | tail -6 \
        || warn "Schema push failed — manual SQL migrations below will handle missing columns."
fi

# ─── Step 5: SQL Migrations (idempotent) ──────────────────────────────────────
info "Applying SQL migrations..."

# Write SQL to a temp file — avoids nested heredoc issues in bash
SQL_TMP=$(mktemp /tmp/anchat_migrate_XXXXXX.sql)
cat > "$SQL_TMP" << 'ENDSQL'
-- Rename old column if still exists (old installs)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='backup_config' AND column_name='schedule_hours'
  ) THEN
    ALTER TABLE backup_config RENAME COLUMN schedule_hours TO schedule_minutes;
    RAISE NOTICE 'Renamed schedule_hours -> schedule_minutes';
  END IF;
END $$;

-- Add missing columns (no-op if already exist)
ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS schedule_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE users         ADD COLUMN IF NOT EXISTS last_spin_date   varchar(10);
ALTER TABLE users         ADD COLUMN IF NOT EXISTS city             varchar(100);

-- Reset all serial sequences (prevents duplicate key errors after DB restore)
DO $$
DECLARE
  seq_rec RECORD;
  max_val BIGINT;
BEGIN
  FOR seq_rec IN
    SELECT
      s.relname                       AS seq_name,
      a.attrelid::regclass::text      AS tbl_name,
      a.attname                       AS col_name
    FROM pg_class s
    JOIN pg_depend   d  ON d.objid      = s.oid
    JOIN pg_attribute a ON a.attrelid   = d.refobjid
                       AND a.attnum     = d.refobjsubid
    WHERE s.relkind  = 'S'
      AND d.deptype  = 'a'
      AND s.relname NOT LIKE 'pg_%'
  LOOP
    BEGIN
      EXECUTE format('SELECT COALESCE(MAX(%I), 1) FROM %s', seq_rec.col_name, seq_rec.tbl_name) INTO max_val;
      EXECUTE format('SELECT setval(%L, %s)', seq_rec.seq_name, max_val);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- Ensure bot user has full permissions
DO $$
BEGIN
  EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO anchatbot';
  EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anchatbot';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ENDSQL

# Try postgres superuser first (most reliable when running as root)
if sudo -u postgres psql -d "$DB_NAME" -f "$SQL_TMP" >/dev/null 2>&1; then
    ok "SQL migrations applied (postgres superuser)"
elif PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d "$DB_NAME" -f "$SQL_TMP" >/dev/null 2>&1; then
    ok "SQL migrations applied (password auth)"
else
    warn "SQL migrations failed — bot may still work if schema is already up to date."
fi
rm -f "$SQL_TMP"

# ─── Step 6: Recreate ecosystem.config.cjs if missing ────────────────────────
if [ ! -f "$ECOSYSTEM_FILE" ]; then
    warn "ecosystem.config.cjs missing — recreating..."
    cat > "$ECOSYSTEM_FILE" << ECOSYSTEM
module.exports = {
  apps: [{
    name:          'anchatbot',
    script:        '${SCRIPT_DIR}/artifacts/api-server/dist/index.mjs',
    cwd:           '${SCRIPT_DIR}',
    interpreter:   'node',
    node_args:     '--enable-source-maps --env-file ${ENV_FILE}',
    restart_delay: 5000,
    max_restarts:  20,
    watch:         false,
    autorestart:   true,
    env: {
      NODE_ENV: 'production',
      PORT:     '5000'
    }
  }]
};
ECOSYSTEM
    ok "ecosystem.config.cjs recreated"
fi

# ─── Step 7: Restart bot ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 5 — Restart bot${NC}"

if pm2 describe anchatbot >/dev/null 2>&1; then
    pm2 restart anchatbot
    ok "Bot restarted"
else
    warn "anchatbot not found in PM2 — starting fresh from ecosystem config..."
    pm2 start "$ECOSYSTEM_FILE"
    ok "Bot started"
fi
pm2 save >/dev/null 2>&1 || true

# ─── Step 8: Health check ─────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 6 — Health check${NC}"
sleep 5

BOT_STATUS=$(pm2 jlist 2>/dev/null \
    | node -e "
        try {
            const data = require('fs').readFileSync('/dev/stdin','utf8');
            const list = JSON.parse(data);
            const proc = list.find(p => p.name === 'anchatbot');
            process.stdout.write(proc ? proc.pm2_env.status : 'not_found');
        } catch(e) { process.stdout.write('parse_error'); }
    " 2>/dev/null || echo "unknown")

if [[ "$BOT_STATUS" == "online" ]]; then
    ok "Bot is ONLINE ✔"
else
    warn "Bot status: '${BOT_STATUS}'"
    echo ""
    info "Recent logs:"
    pm2 logs anchatbot --lines 20 --nostream 2>/dev/null || true
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
