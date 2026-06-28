#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  AnymsChatBot — Fully-Automatic Installer
#  Usage: sudo bash install.sh
#  Supports: Ubuntu 20+, Debian 11+, CentOS/Rocky/AlmaLinux 8+, Fedora 37+
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $*${NC}"; }
info() { echo -e "${CYAN}ℹ  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }

echo -e "${BOLD}"
echo "═══════════════════════════════════════════════════"
echo "   🤖 AnymsChatBot — Installer v2"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"

# ─── Root check ──────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    die "Please run as root:  sudo bash install.sh"
fi

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

read -rp "👤 Second Admin ID (optional, press Enter to skip): " ADMIN_ID_2
if [[ -n "$ADMIN_ID_2" && ! "$ADMIN_ID_2" =~ ^[0-9]+$ ]]; then
    warn "Invalid ID — skipping second admin."
    ADMIN_ID_2=""
fi

# Build comma-separated ADMIN_IDS
if [[ -n "$ADMIN_ID_2" ]]; then
    ADMIN_IDS="${ADMIN_ID_1},${ADMIN_ID_2}"
else
    ADMIN_IDS="${ADMIN_ID_1}"
fi
echo ""

# ─── Step 2: Detect OS ───────────────────────────────────────────────────────
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release; echo "${ID:-unknown}"
    elif command -v apt-get >/dev/null 2>&1; then echo "debian"
    elif command -v yum    >/dev/null 2>&1; then echo "centos"
    else echo "unknown"; fi
}
OS=$(detect_os)
info "OS detected: $OS"

# ─── Step 3: Node.js 22 ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 2 — Node.js 22 (LTS)${NC}"
NEED_NODE=false
if ! command -v node >/dev/null 2>&1; then
    NEED_NODE=true
else
    NODE_MAJ=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
    [ "$NODE_MAJ" -lt 22 ] && NEED_NODE=true
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
ok "Node.js $NODE_VER ready"

# ─── Step 4: pnpm ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 3 — pnpm${NC}"
if ! command -v pnpm >/dev/null 2>&1; then
    info "Installing pnpm..."
    npm install -g pnpm --silent
fi
ok "pnpm $(pnpm -v) ready"

# ─── Step 5: PostgreSQL ──────────────────────────────────────────────────────
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

# Ensure PostgreSQL is running
systemctl enable postgresql >/dev/null 2>&1 || true
systemctl start  postgresql >/dev/null 2>&1 \
    || service postgresql start >/dev/null 2>&1 \
    || true
sleep 2
ok "PostgreSQL running"

# Create database + user with random password
DB_NAME="anchatbot"
DB_USER="anchatbot"
DB_PASS="$(openssl rand -hex 14 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(14))')"
DB_HOST="localhost"
DB_PORT="5432"

info "Creating database '$DB_NAME' and user '$DB_USER'..."

sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null \
    || sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null \
    || true

sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null \
    || sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};" 2>/dev/null \
    || true

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

# Allow password-based auth in pg_hba.conf
PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' \n')
if [ -n "$PG_HBA" ] && [ -f "$PG_HBA" ]; then
    if ! grep -qE "^host.*${DB_NAME}.*${DB_USER}.*(md5|scram)" "$PG_HBA" 2>/dev/null; then
        printf "host    %-20s %-20s 127.0.0.1/32    md5\n" "${DB_NAME}" "${DB_USER}" >> "$PG_HBA"
        printf "host    %-20s %-20s ::1/128         md5\n" "${DB_NAME}" "${DB_USER}" >> "$PG_HBA"
        systemctl reload postgresql >/dev/null 2>&1 \
            || service postgresql reload >/dev/null 2>&1 \
            || true
        sleep 1
    fi
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Verify connection
if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
       -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    ok "Database connection verified"
else
    warn "Could not verify DB connection — continuing. Check logs if the bot fails to start."
fi

# ─── Step 6: Write .env ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 5 — Environment file${NC}"

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${INSTALL_DIR}/.env"

cat > "$ENV_FILE" << ENVEOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
ADMIN_IDS=${ADMIN_IDS}
DATABASE_URL=${DATABASE_URL}
NODE_ENV=production
PORT=5000
ENVEOF

ok ".env created at $ENV_FILE"

# Export so sub-processes pick them up
export TELEGRAM_BOT_TOKEN="$BOT_TOKEN"
export ADMIN_IDS="$ADMIN_IDS"
export DATABASE_URL="$DATABASE_URL"
export NODE_ENV="production"
export PORT="5000"

# ─── Step 7: JS dependencies ─────────────────────────────────────────────────
echo -e "\n${BOLD}Step 6 — Node.js dependencies${NC}"
info "Running pnpm install..."
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile 2>&1 | grep -E "ERR|error|added|Done" | tail -5 || true
ok "Dependencies installed"

# ─── Step 8: Build ───────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 7 — Build${NC}"
info "Building with esbuild (fast)..."
cd "${INSTALL_DIR}/artifacts/api-server"
pnpm run build
cd "$INSTALL_DIR"
ok "Build complete"

# ─── Step 9: Apply DB schema ─────────────────────────────────────────────────
echo -e "\n${BOLD}Step 8 — Database schema${NC}"
info "Pushing schema (drizzle-kit)..."
cd "$INSTALL_DIR"

if pnpm --filter @workspace/db run push-force 2>&1 | tail -5; then
    ok "Database schema applied"
else
    warn "Retrying with prompt bypass..."
    yes 2>/dev/null | pnpm --filter @workspace/db run push 2>&1 | tail -5 \
        || die "Database schema push failed. Check DATABASE_URL and PostgreSQL logs."
fi

# ─── Step 10: PM2 process manager ────────────────────────────────────────────
echo -e "\n${BOLD}Step 9 — Process manager (PM2)${NC}"

if ! command -v pm2 >/dev/null 2>&1; then
    info "Installing PM2..."
    npm install -g pm2 --silent
fi
ok "PM2 $(pm2 -v) ready"

cd "$INSTALL_DIR"
pm2 delete anchatbot >/dev/null 2>&1 || true

pm2 start \
    "pnpm --filter @workspace/api-server run start" \
    --name anchatbot \
    --restart-delay=5000 \
    --max-restarts=20 \
    >/dev/null 2>&1

pm2 save >/dev/null 2>&1 || true

# Enable auto-start on reboot
STARTUP_CMD=$(pm2 startup 2>/dev/null | grep -E "^sudo|^env PATH" | head -1 || true)
if [ -n "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD" >/dev/null 2>&1 || true
fi
ok "PM2 auto-start on reboot configured"

# ─── Step 11: Health check ───────────────────────────────────────────────────
echo -e "\n${BOLD}Step 10 — Health check${NC}"
sleep 6

BOT_STATUS=$(pm2 show anchatbot 2>/dev/null | grep -E "status\s*│" | awk '{print $NF}' | tr -d '│ ')
if [[ "$BOT_STATUS" == "online" ]]; then
    ok "Bot process is ONLINE ✔"
else
    warn "Bot process status: '${BOT_STATUS:-unknown}'"
    warn "Check logs with: pm2 logs anchatbot"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "═══════════════════════════════════════════════════"
echo "   🎉 Installation complete!"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"
printf "  %-20s %s\n" "Bot Token:"    "${BOT_TOKEN:0:12}…"
printf "  %-20s %s\n" "Admin IDs:"    "${ADMIN_IDS}"
printf "  %-20s %s\n" "DB Host:"      "${DB_HOST}:${DB_PORT}/${DB_NAME}"
printf "  %-20s %s\n" "DB Password:"  "${DB_PASS}"
echo ""
echo -e "${BOLD}  PM2 commands:${NC}"
echo "    pm2 status              — view process status"
echo "    pm2 logs anchatbot      — view live logs"
echo "    pm2 restart anchatbot   — restart the bot"
echo "    pm2 stop anchatbot      — stop the bot"
echo "    pm2 monit               — live CPU/memory monitor"
echo ""
echo -e "${BOLD}  First steps in Telegram:${NC}"
echo "    1. Open your bot and send /start"
echo "    2. Send /admin to open the admin panel"
echo "    3. Admin → Payments → TetraPay → 🔄 Auto-detect URL"
echo "    4. Admin → Payments → set card/crypto details"
echo "    5. Admin → Backup → 🔑 Generate code → send /verify_backup CODE in group"
echo "    6. Admin → Backup → 📤 Send backup now"
echo ""
echo -e "${BOLD}  Backup & Restore:${NC}"
echo "    - Backup: Admin panel → 💾 Backup → 📤 Send now"
echo "    - Restore: Send backup_*.json.gz file directly to the bot"
echo "═══════════════════════════════════════════════════"
