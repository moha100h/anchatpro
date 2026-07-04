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

# ─── Detect OS (needed by every later step) ──────────────────────────────────
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release; echo "${ID:-unknown}"
    elif command -v apt-get >/dev/null 2>&1; then echo "debian"
    elif command -v yum    >/dev/null 2>&1; then echo "centos"
    else echo "unknown"; fi
}
OS=$(detect_os)
info "OS detected: $OS"

# ─── Step 0: System update + base prerequisites ──────────────────────────────
# A fresh/minimal VPS often lacks curl, git, openssl and CA certificates — and
# the very next step (Telegram token validation) already needs curl. Update the
# system and install the essentials FIRST, so every later step runs against an
# up-to-date package index and has the tools it depends on. This is also where
# we honour the "update Linux if needed" requirement.
echo -e "\n${BOLD}Step 0 — System update & prerequisites${NC}"
APT_LOG="$(mktemp)"
case "$OS" in
    ubuntu|debian|raspbian)
        export DEBIAN_FRONTEND=noninteractive
        info "Updating apt package index..."
        if ! apt-get update -y > "$APT_LOG" 2>&1; then
            warn "apt-get update reported errors — retrying with --fix-missing:"
            tail -12 "$APT_LOG"
            apt-get update -y --fix-missing > "$APT_LOG" 2>&1 || true
        fi
        info "Upgrading installed packages (may take a few minutes)..."
        apt-get -y \
            -o Dpkg::Options::="--force-confdef" \
            -o Dpkg::Options::="--force-confold" \
            upgrade > "$APT_LOG" 2>&1 || warn "apt-get upgrade reported warnings — continuing"
        # Repair any half-configured dpkg state left by an interrupted previous
        # run or the upgrade above — otherwise the next `apt-get install` aborts
        # with "dpkg was interrupted, you must manually run dpkg --configure -a".
        dpkg --configure -a > /dev/null 2>&1 || true
        info "Installing base tools (curl, git, openssl, ca-certificates, gnupg)..."
        # Bulk install first; if it fails (e.g. one package can't be located
        # because of a broken/stale third-party repo), show the real error and
        # fall back to installing each package individually so one bad package
        # doesn't block the essentials. Whether curl/git/openssl actually made
        # it in is verified after the case block.
        if ! apt-get install -y curl git openssl ca-certificates gnupg lsb-release > "$APT_LOG" 2>&1; then
            warn "Bulk install failed — apt errors below, retrying packages one by one:"
            tail -20 "$APT_LOG"
            apt-get update -y --fix-missing > /dev/null 2>&1 || true
            for pkg in curl git openssl ca-certificates gnupg lsb-release; do
                apt-get install -y "$pkg" > /dev/null 2>&1 || warn "  could not install: $pkg"
            done
        fi
        ;;
    centos|rhel|rocky|almalinux)
        info "Updating system packages (yum)..."
        yum -y update > "$APT_LOG" 2>&1 || warn "yum update reported warnings — continuing"
        info "Installing base tools (curl, git, openssl, ca-certificates)..."
        if ! yum install -y curl git openssl ca-certificates > "$APT_LOG" 2>&1; then
            warn "Bulk install failed — errors below, retrying packages one by one:"
            tail -20 "$APT_LOG"
            for pkg in curl git openssl ca-certificates; do
                yum install -y "$pkg" > /dev/null 2>&1 || warn "  could not install: $pkg"
            done
        fi
        ;;
    fedora)
        info "Updating system packages (dnf)..."
        dnf -y update > "$APT_LOG" 2>&1 || warn "dnf update reported warnings — continuing"
        info "Installing base tools (curl, git, openssl, ca-certificates)..."
        if ! dnf install -y curl git openssl ca-certificates > "$APT_LOG" 2>&1; then
            warn "Bulk install failed — errors below, retrying packages one by one:"
            tail -20 "$APT_LOG"
            for pkg in curl git openssl ca-certificates; do
                dnf install -y "$pkg" > /dev/null 2>&1 || warn "  could not install: $pkg"
            done
        fi
        ;;
    *)
        warn "Unknown OS '$OS' — skipping system update."
        warn "Make sure curl, git and openssl are installed before continuing."
        ;;
esac
rm -f "$APT_LOG"

# Only curl, git and openssl are hard requirements for the rest of the install.
# Verify they are actually present now — anything else (ca-certificates, gnupg,
# lsb-release) is nice-to-have and must not abort a working system.
MISSING_TOOLS=""
for t in curl git openssl; do
    command -v "$t" >/dev/null 2>&1 || MISSING_TOOLS="${MISSING_TOOLS} $t"
done
if [ -n "$MISSING_TOOLS" ]; then
    warn "These essential tools could not be installed:${MISSING_TOOLS}"
    warn "This almost always means apt/yum has a broken source. Try:"
    warn "   apt-get update --fix-missing      (Debian/Ubuntu)"
    warn "   and check /etc/apt/sources.list(.d) for an unreachable repo,"
    warn "   then re-run this installer."
    die "Cannot continue without:${MISSING_TOOLS}"
fi
ok "System updated & prerequisites installed"

# ─── Step 1: Credentials ─────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 1 — Credentials${NC}\n"

while true; do
    read -rp "🤖 Telegram Bot Token (from @BotFather): " BOT_TOKEN
    if [[ -z "$BOT_TOKEN" ]]; then
        warn "Token cannot be empty."
        continue
    fi
    # Validate against Telegram's API right away — catches typos/expired
    # tokens immediately instead of after a full install+build cycle, when
    # the bot silently fails to start and the only symptom is "won't respond".
    #
    # NOTE: api.telegram.org is blocked/filtered at the ISP level in some
    # countries (e.g. Iran) unless the server has a proxy configured. On
    # those hosts, a plain TCP SYN gets silently dropped (black-holed) —
    # some curl builds don't reliably honor --max-time against a hung DNS
    # lookup or a black-holed connect in that case, so this can hang far
    # longer than 10s. Wrap the whole thing in an external `timeout` as a
    # hard kill switch, and use --connect-timeout in addition to --max-time,
    # and --ipv4 to skip a slow/broken IPv6 path.
    info "Validating token with Telegram (max 12s)..."
    TG_CHECK=$(timeout 12 curl -fsS --ipv4 --connect-timeout 6 --max-time 10 \
        "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null || true)
    if echo "$TG_CHECK" | grep -q '"ok":true'; then
        # Parse the username with grep/sed only — Node.js isn't installed yet
        # at this point (that's Step 2), so we must NOT depend on `node` here.
        BOT_USERNAME=$(echo "$TG_CHECK" | grep -o '"username":"[^"]*"' | head -1 | sed 's/.*":"//; s/"$//')
        ok "Token valid — bot: @${BOT_USERNAME:-unknown}"
        break
    else
        warn "Could not verify token with Telegram (invalid token, or Telegram API is blocked/filtered from this server — common on Iranian VPS providers without a proxy)."
        read -rp "   ادامه بدون تایید؟ (y/N): " SKIP_VERIFY
        if [[ "$SKIP_VERIFY" =~ ^[Yy]$ ]]; then
            break
        fi
    fi
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

# ─── Step 1b: Public domain (for webhook callbacks) ──────────────────────────
echo ""
echo -e "${BOLD}  🌐 Domain / Webhook URL${NC}"
echo -e "  ${CYAN}برای درگاه‌های پرداخت (Plisio, TetraPay) آدرس عمومی سرور لازم است.${NC}"
echo -e "  ${CYAN}اگر دامنه یا IP عمومی دارید وارد کنید — در غیر این صورت Enter بزنید.${NC}"
echo ""
read -rp "  آدرس سرور (مثال: https://mybotdomain.com یا http://1.2.3.4:5000): " PUBLIC_URL
PUBLIC_URL="${PUBLIC_URL%/}"  # strip trailing slash

if [[ -n "$PUBLIC_URL" ]]; then
    # Basic validation: must start with http
    if [[ "$PUBLIC_URL" =~ ^https?:// ]]; then
        ok "Domain/URL: $PUBLIC_URL"
        BASE_URL="$PUBLIC_URL"
    else
        warn "آدرس باید با http:// یا https:// شروع شود — نادیده گرفته شد."
        BASE_URL=""
    fi
else
    BASE_URL=""
    info "Domain/URL not set — you can add it later with:"
    info "  echo 'BASE_URL=https://yourdomain.com' >> .env && pm2 restart anchatbot"
fi
echo ""

# ─── Step 2: Node.js 22 ──────────────────────────────────────────────────────
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

# Run psql as the 'postgres' OS superuser. We already run as root, so prefer
# `runuser` (from util-linux — present on essentially every systemd distro and
# needs no sudo). Minimal Debian/Ubuntu images frequently DON'T ship `sudo`,
# so relying on `sudo -u postgres` there silently fails and the whole DB setup
# degrades. Fall back to `su` (quoting args safely) if runuser is missing.
run_psql_super() {
    if command -v runuser >/dev/null 2>&1; then
        runuser -u postgres -- psql "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo -u postgres psql "$@"
    else
        su postgres -s /bin/sh -c "psql $(printf '%q ' "$@")"
    fi
}

run_psql_super -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null \
    || run_psql_super -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null \
    || true

run_psql_super -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null \
    || run_psql_super -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};" 2>/dev/null \
    || true

run_psql_super -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

# Allow password-based auth in pg_hba.conf
PG_HBA=$(run_psql_super -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' \n')
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

# Verify connection — this is a HARD gate. If the app can't reach the DB now,
# every later step (schema push, build, runtime) is doomed, so fail fast with
# actionable diagnostics instead of limping onward to a confusing later error.
if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
       -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    ok "Database connection verified"
else
    warn "Could not connect to the database as '${DB_USER}'. Diagnostics:"
    echo "──────────────────────────────────────────────────────────"
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d "$DB_NAME" -c "SELECT 1;" 2>&1 | head -10 || true
    echo "──────────────────────────────────────────────────────────"
    warn "Check that PostgreSQL is running (systemctl status postgresql) and that"
    warn "pg_hba.conf allows md5/scram auth on 127.0.0.1 for user '${DB_USER}'."
    die "Database connection failed — aborting before schema/build steps."
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

# Append BASE_URL only if provided
if [[ -n "$BASE_URL" ]]; then
    echo "BASE_URL=${BASE_URL}" >> "$ENV_FILE"
fi

ok ".env created at $ENV_FILE"

# Export so sub-processes pick them up
export TELEGRAM_BOT_TOKEN="$BOT_TOKEN"
export ADMIN_IDS="$ADMIN_IDS"
export DATABASE_URL="$DATABASE_URL"
export NODE_ENV="production"
export PORT="5000"
[[ -n "$BASE_URL" ]] && export BASE_URL="$BASE_URL"

# ─── Step 7: JS dependencies ─────────────────────────────────────────────────
echo -e "\n${BOLD}Step 6 — Node.js dependencies${NC}"
info "Running pnpm install..."
cd "$INSTALL_DIR"

# NOTE: piping through `grep | tail` (as before) reports the exit status of
# `tail`/`grep`, not of `pnpm install` — so a genuinely failed install would
# still print "Dependencies installed" and the script would carry on to
# build/DB steps against a broken node_modules. Capture the real exit code.
INSTALL_LOG="$(mktemp)"
if pnpm install --frozen-lockfile > "$INSTALL_LOG" 2>&1; then
    grep -E "ERR|error|added|Done" "$INSTALL_LOG" | tail -5 || true
    ok "Dependencies installed"
else
    tail -30 "$INSTALL_LOG"
    rm -f "$INSTALL_LOG"
    die "pnpm install failed. Full log above."
fi
rm -f "$INSTALL_LOG"

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


# NOTE: `cmd | tail -5` reports the exit status of `tail` (always 0), not of
# the actual push command — that previously made this step always print
# "✅ Database schema applied" even when the push genuinely failed, hiding
# real errors (e.g. incompatible column/type changes). Capture full output to
# a temp log and check the real exit code via PIPESTATUS instead.
PUSH_LOG="$(mktemp)"
pnpm --filter @workspace/db run push-force > "$PUSH_LOG" 2>&1
PUSH_EXIT=$?

if [ "$PUSH_EXIT" -eq 0 ]; then
    tail -5 "$PUSH_LOG"
    ok "Database schema applied"
else
    warn "push-force failed (exit $PUSH_EXIT) — retrying with prompt bypass..."
    tail -15 "$PUSH_LOG"
    yes 2>/dev/null | pnpm --filter @workspace/db run push > "$PUSH_LOG" 2>&1
    PUSH_EXIT=$?
    tail -15 "$PUSH_LOG"
    if [ "$PUSH_EXIT" -ne 0 ]; then
        rm -f "$PUSH_LOG"
        die "Database schema push failed. Full log above. Check DATABASE_URL and PostgreSQL logs."
    fi
    ok "Database schema applied (via prompt-bypass retry)"
fi
rm -f "$PUSH_LOG"

# ─── Column migrations (safe — no-op if already applied) ─────────────────────
info "Applying column migrations..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "ALTER TABLE backup_config RENAME COLUMN schedule_hours TO schedule_minutes;" \
    >/dev/null 2>&1 || true
ok "Column migrations done"

# ─── Step 9: Firewall ─────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 9 — Firewall${NC}"
if command -v ufw >/dev/null 2>&1; then
    if ufw status 2>/dev/null | grep -q "Status: active"; then
        ufw allow 5000/tcp >/dev/null 2>&1 || true
        ufw allow 80/tcp   >/dev/null 2>&1 || true
        ufw allow 443/tcp  >/dev/null 2>&1 || true
        ok "ufw: opened 5000, 80, 443"
    else
        info "ufw installed but inactive — skipping (no ports blocked by default)"
    fi
elif command -v firewall-cmd >/dev/null 2>&1; then
    if systemctl is-active --quiet firewalld 2>/dev/null; then
        firewall-cmd --permanent --add-port=5000/tcp >/dev/null 2>&1 || true
        firewall-cmd --permanent --add-port=80/tcp   >/dev/null 2>&1 || true
        firewall-cmd --permanent --add-port=443/tcp  >/dev/null 2>&1 || true
        firewall-cmd --reload >/dev/null 2>&1 || true
        ok "firewalld: opened 5000, 80, 443"
    else
        info "firewalld installed but inactive — skipping"
    fi
else
    info "No firewall manager detected — skipping"
fi

# ─── Step 10: PM2 process manager ────────────────────────────────────────────
echo -e "\n${BOLD}Step 10 — Process manager (PM2)${NC}"

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
echo -e "\n${BOLD}Step 11 — Health check${NC}"
sleep 8

# Use `pm2 jlist` (stable JSON output) instead of screen-scraping the `pm2 show`
# table — the table's box-drawing characters vary by pm2 version/locale/terminal
# and made the previous grep/awk parser unreliable (always showed 'unknown').
BOT_STATUS=$(pm2 jlist 2>/dev/null | node -e "
  try {
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const p = list.find(x => x.name === 'anchatbot');
    process.stdout.write(p ? (p.pm2_env && p.pm2_env.status || 'unknown') : 'not_found');
  } catch (e) { process.stdout.write('unknown'); }
" 2>/dev/null)

if [[ "$BOT_STATUS" == "online" ]]; then
    ok "Bot process is ONLINE ✔"
else
    warn "Bot process status: '${BOT_STATUS:-unknown}'"
    warn "Last 40 log lines (pm2 logs anchatbot --lines 40 --nostream):"
    echo "──────────────────────────────────────────────────────────"
    pm2 logs anchatbot --lines 40 --nostream 2>/dev/null || true
    echo "──────────────────────────────────────────────────────────"
    warn "If this doesn't explain it, run: pm2 logs anchatbot"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "═══════════════════════════════════════════════════"
echo "   🎉 Installation complete!"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"
printf "  %-22s %s\n" "Bot Token:"    "${BOT_TOKEN:0:12}…"
printf "  %-22s %s\n" "Admin IDs:"    "${ADMIN_IDS}"
printf "  %-22s %s\n" "DB Host:"      "${DB_HOST}:${DB_PORT}/${DB_NAME}"
printf "  %-22s %s\n" "DB Password:"  "${DB_PASS}"
if [[ -n "$BASE_URL" ]]; then
printf "  %-22s %s\n" "Base URL:"     "${BASE_URL}"
printf "  %-22s %s\n" "Plisio webhook:"  "${BASE_URL}/webhook/plisio?json=true"
printf "  %-22s %s\n" "TetraPay webhook:" "${BASE_URL}/webhook/tetrapay"
fi
echo ""

if [[ -z "$BASE_URL" ]]; then
    echo -e "${YELLOW}  ⚠  BASE_URL not set — درگاه‌های پرداخت آنلاین (Plisio/TetraPay) کار نخواهند کرد.${NC}"
    echo -e "${YELLOW}     برای فعال‌سازی یک دستور در ترمینال اجرا کنید:${NC}"
    echo ""
    echo -e "${BOLD}     bash -c \"echo 'BASE_URL=https://yourdomain.com' >> ${ENV_FILE} && pm2 restart anchatbot\"${NC}"
    echo ""
fi

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
if [[ -n "$BASE_URL" ]]; then
echo "    3. Admin → پرداخت → Plisio → 🔗 تشخیص خودکار Callback URL"
echo "       (URL تنظیم می‌شود — همان را در پنل Plisio در فیلد Status URL وارد کنید)"
echo "    4. Admin → پرداخت → TetraPay → 🔄 تشخیص خودکار URL"
echo "    5. Admin → Backup → 🔑 Generate code → send /verify_backup CODE in group"
echo "    6. Admin → Backup → 📤 Send backup now"
else
echo "    3. Admin → پرداخت → Plisio → ✏️ ویرایش Callback URL"
echo "       و آدرس زیر را وارد کنید:  https://yourdomain.com/webhook/plisio?json=true"
echo "    4. Admin → Backup → 🔑 Generate code → send /verify_backup CODE in group"
fi
echo ""
echo -e "${BOLD}  Backup & Restore:${NC}"
echo "    - Backup: Admin panel → 💾 Backup → 📤 Send now"
echo "    - Restore: Send backup_*.json.gz file directly to the bot"
echo "═══════════════════════════════════════════════════"
