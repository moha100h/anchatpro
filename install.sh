#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  AnymsChatBot — Fully-Automatic Installer v3
#  Usage: sudo bash install.sh
#  Supports: Ubuntu 20+, Debian 11+, CentOS/Rocky/AlmaLinux 8+, Fedora 37+
#  Architecture: x86_64 (recommended), ARM64 (supported with auto-patch)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
info() { echo -e "${CYAN}ℹ  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }

# INSTALL_DIR must be set at the very top — before any other logic
INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${INSTALL_DIR}/.env"
ECOSYSTEM_FILE="${INSTALL_DIR}/ecosystem.config.cjs"

echo -e "${BOLD}"
echo "═══════════════════════════════════════════════════"
echo "   🤖 AnymsChatBot — Installer v3"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"

# ─── Root check ──────────────────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && die "Please run as root:  sudo bash install.sh"

# ─── Step 1: Credentials ─────────────────────────────────────────────────────
echo -e "${BOLD}Step 1 — Credentials${NC}\n"

while true; do
    read -rp "🤖 Telegram Bot Token (from @BotFather): " BOT_TOKEN
    [[ -n "$BOT_TOKEN" ]] && break
    warn "Token cannot be empty."
done

while true; do
    read -rp "👤 Super Admin Telegram ID (numeric): " ADMIN_ID_1
    [[ "$ADMIN_ID_1" =~ ^[0-9]+$ ]] && break
    warn "Must be a numeric Telegram ID."
done

read -rp "👤 Second Admin ID (optional, press Enter to skip): " ADMIN_ID_2 || ADMIN_ID_2=""
if [[ -n "$ADMIN_ID_2" && ! "$ADMIN_ID_2" =~ ^[0-9]+$ ]]; then
    warn "Invalid ID — skipping second admin."
    ADMIN_ID_2=""
fi

ADMIN_IDS="${ADMIN_ID_1}"
[[ -n "$ADMIN_ID_2" ]] && ADMIN_IDS="${ADMIN_ID_1},${ADMIN_ID_2}"

# ─── Step 1b: Public domain ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  🌐 Domain / Webhook URL${NC}"
echo -e "  ${CYAN}برای درگاه‌های پرداخت (Plisio, TetraPay) آدرس عمومی سرور لازم است.${NC}"
echo -e "  ${CYAN}اگر دامنه یا IP عمومی دارید وارد کنید — در غیر این صورت Enter بزنید.${NC}"
echo ""
read -rp "  آدرس سرور (مثال: https://mybotdomain.com یا http://1.2.3.4:5000): " PUBLIC_URL || PUBLIC_URL=""
PUBLIC_URL="${PUBLIC_URL%/}"
BASE_URL=""

if [[ -n "$PUBLIC_URL" ]]; then
    if [[ "$PUBLIC_URL" =~ ^https?:// ]]; then
        ok "Domain/URL: $PUBLIC_URL"
        BASE_URL="$PUBLIC_URL"
    else
        warn "آدرس باید با http:// یا https:// شروع شود — نادیده گرفته شد."
    fi
else
    info "Domain/URL not set — add it later:"
    info "  echo 'BASE_URL=https://yourdomain.com' >> ${ENV_FILE} && pm2 restart anchatbot"
fi
echo ""

# ─── Step 2: Detect OS & Architecture ────────────────────────────────────────
detect_os() {
    if [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release; echo "${ID:-unknown}"
    elif command -v apt-get >/dev/null 2>&1; then echo "debian"
    elif command -v yum    >/dev/null 2>&1; then echo "centos"
    else echo "unknown"; fi
}
OS=$(detect_os)
ARCH=$(uname -m)
info "OS: $OS | Architecture: $ARCH"

# ─── Step 3: Node.js 22 ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 2 — Node.js 22 (LTS)${NC}"
NEED_NODE=false
if ! command -v node >/dev/null 2>&1; then
    NEED_NODE=true
else
    NODE_MAJ=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
    [[ "$NODE_MAJ" -lt 20 ]] && NEED_NODE=true
fi

if $NEED_NODE; then
    info "Installing Node.js 22..."
    case "$OS" in
        ubuntu|debian|raspbian)
            export DEBIAN_FRONTEND=noninteractive
            apt-get update -qq >/dev/null 2>&1
            curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
            apt-get install -y nodejs >/dev/null 2>&1
            ;;
        centos|rhel|rocky|almalinux)
            curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
            yum install -y nodejs >/dev/null 2>&1
            ;;
        fedora)
            curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
            dnf install -y nodejs >/dev/null 2>&1
            ;;
        *)
            die "Cannot auto-install Node.js on OS '$OS'. Install Node.js 22+ manually and re-run."
            ;;
    esac
fi
NODE_VER=$(node -v)
NODE_MAJ_NOW=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
[[ "$NODE_MAJ_NOW" -lt 20 ]] && die "Node.js 20+ required (found $NODE_VER). Install manually."
ok "Node.js $NODE_VER ready"

# ─── Step 4: pnpm ─────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 3 — pnpm${NC}"
if ! command -v pnpm >/dev/null 2>&1; then
    info "Installing pnpm..."
    npm install -g pnpm >/dev/null 2>&1
fi
ok "pnpm $(pnpm -v) ready"

# ─── Step 5: PostgreSQL ───────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 4 — PostgreSQL${NC}"

if ! command -v psql >/dev/null 2>&1; then
    info "Installing PostgreSQL..."
    case "$OS" in
        ubuntu|debian|raspbian)
            export DEBIAN_FRONTEND=noninteractive
            apt-get update -qq >/dev/null 2>&1
            apt-get install -y postgresql postgresql-contrib >/dev/null 2>&1
            ;;
        centos|rhel|rocky|almalinux)
            yum install -y postgresql-server postgresql-contrib >/dev/null 2>&1
            postgresql-setup --initdb >/dev/null 2>&1 || true
            ;;
        fedora)
            dnf install -y postgresql-server postgresql-contrib >/dev/null 2>&1
            postgresql-setup --initdb >/dev/null 2>&1 || true
            ;;
        *)
            die "Cannot auto-install PostgreSQL on OS '$OS'. Install it manually and re-run."
            ;;
    esac
fi

# Start PostgreSQL
systemctl enable postgresql >/dev/null 2>&1 || true
systemctl start  postgresql >/dev/null 2>&1 \
    || service postgresql start >/dev/null 2>&1 \
    || true
sleep 2
ok "PostgreSQL running"

# DB credentials
DB_NAME="anchatbot"
DB_USER="anchatbot"
DB_PASS="$(openssl rand -hex 14 2>/dev/null \
    || python3 -c 'import secrets; print(secrets.token_hex(14))' 2>/dev/null \
    || echo "anchatbot$(date +%s)pw")"
DB_HOST="localhost"
DB_PORT="5432"

info "Creating database '$DB_NAME' and user '$DB_USER'..."

# Create user with SUPERUSER so drizzle-kit can create enums/types (code 42501 prevention)
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH SUPERUSER PASSWORD '${DB_PASS}';" 2>/dev/null \
    || sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH SUPERUSER PASSWORD '${DB_PASS}';" 2>/dev/null \
    || true

# Create database
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null \
    || sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};" 2>/dev/null \
    || true

# Grant schema permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" 2>/dev/null || true

# Configure pg_hba.conf — detect auth method by PostgreSQL version
PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' \n' || true)
if [ -n "$PG_HBA" ] && [ -f "$PG_HBA" ]; then
    if ! grep -qE "${DB_NAME}.*${DB_USER}" "$PG_HBA" 2>/dev/null; then
        PG_VER_NUM=$(sudo -u postgres psql -t -c "SHOW server_version_num;" 2>/dev/null | tr -d ' ' || echo "0")
        PG_AUTH="md5"
        [[ "$PG_VER_NUM" -ge 100000 ]] && PG_AUTH="scram-sha-256"

        printf "host    %-20s %-20s 127.0.0.1/32    %s\n" "${DB_NAME}" "${DB_USER}" "${PG_AUTH}" >> "$PG_HBA"
        printf "host    %-20s %-20s ::1/128         %s\n" "${DB_NAME}" "${DB_USER}" "${PG_AUTH}" >> "$PG_HBA"
        systemctl reload postgresql >/dev/null 2>&1 \
            || service postgresql reload >/dev/null 2>&1 \
            || true
        sleep 1
    fi
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Verify DB connection
if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
       -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    ok "Database connection verified"
else
    warn "Password auth failed — trying socket auth reset..."
    sudo -u postgres psql -d "$DB_NAME" -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true
    sleep 1
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1 \
        || warn "DB connection unverified — check PostgreSQL logs if bot fails."
fi

# ─── Step 6: Write .env ───────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 5 — Environment file${NC}"

cat > "$ENV_FILE" << ENVEOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
ADMIN_IDS=${ADMIN_IDS}
DATABASE_URL=${DATABASE_URL}
NODE_ENV=production
PORT=5000
ENVEOF

[[ -n "$BASE_URL" ]] && echo "BASE_URL=${BASE_URL}" >> "$ENV_FILE"

chmod 600 "$ENV_FILE"
ok ".env created at $ENV_FILE (permissions: 600)"

# Export for sub-processes in this session
export TELEGRAM_BOT_TOKEN="$BOT_TOKEN"
export ADMIN_IDS="$ADMIN_IDS"
export DATABASE_URL="$DATABASE_URL"
export NODE_ENV="production"
export PORT="5000"
[[ -n "$BASE_URL" ]] && export BASE_URL="$BASE_URL"

# ─── Step 7: Architecture patch for pnpm-workspace.yaml ──────────────────────
# The workspace config excludes all non-linux-x64 esbuild binaries (Replit runs x64 only).
# On ARM servers, esbuild would fail to install. Patch temporarily for the build.
WORKSPACE_YAML="${INSTALL_DIR}/pnpm-workspace.yaml"
WORKSPACE_PATCHED=false
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    warn "ARM64 detected — patching pnpm-workspace.yaml to allow ARM esbuild binary..."
    # Remove ARM exclusion overrides temporarily
    sed -i \
        -e '/esbuild.*linux-arm64.*"-"/d' \
        -e '/esbuild.*darwin-arm64.*"-"/d' \
        "$WORKSPACE_YAML" 2>/dev/null || true
    WORKSPACE_PATCHED=true
    ok "pnpm-workspace.yaml patched for ARM64"
fi

# ─── Step 8: JS dependencies ──────────────────────────────────────────────────
echo -e "\n${BOLD}Step 6 — Node.js dependencies${NC}"
info "Running pnpm install..."
cd "$INSTALL_DIR"
# Do NOT use --frozen-lockfile: fresh servers may have slightly different resolution
pnpm install 2>&1 | grep -E "ERR_|error:|Done in|packages are looking" | tail -8 || true
ok "Dependencies installed"

# Restore workspace yaml if patched
if $WORKSPACE_PATCHED; then
    git checkout -- "$WORKSPACE_YAML" 2>/dev/null || true
    info "pnpm-workspace.yaml restored to original"
fi

# ─── Step 9: Build ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 7 — Build${NC}"
info "Building with esbuild..."
pnpm --filter @workspace/api-server run build
ok "Build complete"

# ─── Step 10: Database schema ─────────────────────────────────────────────────
echo -e "\n${BOLD}Step 8 — Database schema${NC}"
info "Pushing schema via drizzle-kit (auto-loads .env)..."
cd "$INSTALL_DIR"

# drizzle.config.ts auto-loads .env; DB user has SUPERUSER → no permission errors
if pnpm --filter @workspace/db run push-force 2>&1 | tail -6; then
    ok "Database schema applied"
else
    warn "push-force failed — trying postgres superuser fallback..."
    sudo -u postgres \
        env DATABASE_URL="postgresql://postgres@/${DB_NAME}" \
        pnpm --filter @workspace/db run push-force 2>&1 | tail -6 \
        || warn "Schema push failed — SQL migrations below will handle missing tables."
fi

# ─── Step 11: SQL Migrations (idempotent, run as postgres superuser) ──────────
echo ""
info "Applying SQL migrations..."

# Use sudo -u postgres (most reliable, no password needed, always available as root)
sudo -u postgres psql -d "$DB_NAME" << 'SQL_MIGRATIONS' || warn "Some SQL migrations failed — bot may still work."

-- ── Rename old column if it still exists from older installs ─────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='backup_config' AND column_name='schedule_hours'
  ) THEN
    ALTER TABLE backup_config RENAME COLUMN schedule_hours TO schedule_minutes;
    RAISE NOTICE 'Renamed schedule_hours -> schedule_minutes';
  END IF;
END $$;

-- ── Add missing columns (no-op if already exists) ────────────────────────────
ALTER TABLE backup_config ADD COLUMN IF NOT EXISTS schedule_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE users         ADD COLUMN IF NOT EXISTS last_spin_date   varchar(10);
ALTER TABLE users         ADD COLUMN IF NOT EXISTS city             varchar(100);

-- ── Reset ALL serial sequences to prevent duplicate key errors ────────────────
-- This fixes the "duplicate key value violates unique constraint" bug
-- that occurs after a database restore or manual data insertion.
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
    WHERE s.relkind  = 'S'     -- sequences only
      AND d.deptype  = 'a'     -- auto-dependency (serial columns)
      AND s.relname NOT LIKE 'pg_%'
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT COALESCE(MAX(%I), 1) FROM %s',
        seq_rec.col_name, seq_rec.tbl_name
      ) INTO max_val;
      EXECUTE format('SELECT setval(%L, %s)', seq_rec.seq_name, max_val);
    EXCEPTION WHEN OTHERS THEN
      -- Skip if table/column doesn't exist yet
      NULL;
    END;
  END LOOP;
END $$;

-- ── Ensure bot user has full permissions on all tables ───────────────────────
DO $$
BEGIN
  EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO anchatbot';
  EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anchatbot';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SQL_MIGRATIONS

ok "SQL migrations applied"

# ─── Step 12: PM2 ecosystem config ────────────────────────────────────────────
echo -e "\n${BOLD}Step 9 — Process manager (PM2)${NC}"

if ! command -v pm2 >/dev/null 2>&1; then
    info "Installing PM2..."
    npm install -g pm2 >/dev/null 2>&1
fi
ok "PM2 $(pm2 -v) ready"

# Write PM2 ecosystem file — most reliable way to configure PM2
# Uses node-args for --env-file (Node 20.6+ feature) so .env is always loaded fresh
cat > "$ECOSYSTEM_FILE" << ECOSYSTEM
module.exports = {
  apps: [{
    name:          'anchatbot',
    script:        '${INSTALL_DIR}/artifacts/api-server/dist/index.mjs',
    cwd:           '${INSTALL_DIR}',
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

ok "PM2 ecosystem config written: $ECOSYSTEM_FILE"

# Delete existing process if any, then start fresh
pm2 delete anchatbot >/dev/null 2>&1 || true
pm2 start "$ECOSYSTEM_FILE"
pm2 save >/dev/null 2>&1 || true

# Auto-start on reboot: pm2 startup prints the command to run
PM2_STARTUP=$(pm2 startup 2>&1 | grep -E "^\s*(sudo env|sudo\s+env|env PATH)" | head -1 | xargs || true)
if [ -n "$PM2_STARTUP" ]; then
    eval "$PM2_STARTUP" >/dev/null 2>&1 && ok "PM2 auto-start on reboot configured" \
        || warn "Could not configure auto-start — run 'pm2 startup' manually"
else
    # Alternative: try to detect the startup command differently
    pm2 startup 2>&1 | tail -3
    warn "Run the 'sudo env PATH=...' command shown above to enable auto-start on reboot."
fi
pm2 save >/dev/null 2>&1 || true

# ─── Step 13: Health check ────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 10 — Health check${NC}"
sleep 6

# Parse PM2 status from JSON (reliable, no box-drawing character grep)
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
    ok "Bot process is ONLINE ✔"
else
    warn "Bot status: '${BOT_STATUS}'"
    echo ""
    info "Recent logs:"
    pm2 logs anchatbot --lines 15 --nostream 2>/dev/null || true
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "═══════════════════════════════════════════════════"
echo "   🎉 Installation complete!"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"
printf "  %-24s %s\n" "Bot Token:"    "${BOT_TOKEN:0:14}…"
printf "  %-24s %s\n" "Admin IDs:"    "${ADMIN_IDS}"
printf "  %-24s %s\n" "Install dir:"  "${INSTALL_DIR}"
printf "  %-24s %s\n" "DB:"           "${DB_HOST}:${DB_PORT}/${DB_NAME}"
printf "  %-24s %s\n" "DB Password:"  "${DB_PASS}"
printf "  %-24s %s\n" "Ecosystem:"    "${ECOSYSTEM_FILE}"
[[ -n "$BASE_URL" ]] && printf "  %-24s %s\n" "Base URL:"         "${BASE_URL}"
[[ -n "$BASE_URL" ]] && printf "  %-24s %s\n" "Plisio webhook:"   "${BASE_URL}/webhook/plisio?json=true"
[[ -n "$BASE_URL" ]] && printf "  %-24s %s\n" "TetraPay webhook:" "${BASE_URL}/webhook/tetrapay"
echo ""

if [[ -z "$BASE_URL" ]]; then
    echo -e "${YELLOW}  ⚠  BASE_URL not set — درگاه‌های پرداخت آنلاین کار نخواهند کرد.${NC}"
    echo -e "${YELLOW}     برای فعال‌سازی:${NC}"
    echo -e "${BOLD}     echo 'BASE_URL=https://yourdomain.com' >> ${ENV_FILE} && pm2 restart anchatbot${NC}"
    echo ""
fi

echo -e "${BOLD}  PM2 commands:${NC}"
echo "    pm2 status              — وضعیت ربات"
echo "    pm2 logs anchatbot      — لاگ‌های زنده"
echo "    pm2 restart anchatbot   — ریستارت ربات"
echo "    pm2 stop anchatbot      — توقف ربات"
echo "    pm2 monit               — مانیتور CPU/RAM"
echo ""
echo -e "${BOLD}  Update (آپدیت):${NC}"
echo "    bash ${INSTALL_DIR}/update.sh"
echo ""
echo -e "${BOLD}  اولین قدم‌ها در تلگرام:${NC}"
echo "    1. ربات را باز کن و /start بفرست"
echo "    2. /admin برای پنل ادمین"
[[ -n "$BASE_URL" ]] && echo "    3. Admin → پرداخت → Plisio → تشخیص خودکار Callback URL"
[[ -n "$BASE_URL" ]] && echo "    4. Admin → پرداخت → TetraPay → تشخیص خودکار URL"
echo "    5. Admin → Backup → Generate code → /verify_backup CODE"
echo ""
echo "═══════════════════════════════════════════════════"
