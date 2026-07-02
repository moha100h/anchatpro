#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  AnonymousChatBot — Fully-Automatic Installer v3
#  Usage: sudo bash install.sh
#  Supports: Ubuntu 20+, Debian 11+, CentOS/Rocky/AlmaLinux 8+
#
#  Installs automatically:
#    Node.js 22, pnpm, PostgreSQL, PM2
#    nginx (reverse proxy, HTTPS)
#    certbot (Let's Encrypt SSL)
#    coturn (TURN server for WebRTC calls)
#
#  Only asks for:
#    1. Telegram Bot Token
#    2. Admin Telegram ID
#    3. Public Domain (e.g. tisabuy.com)
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
echo "   🤖 AnonymousChatBot — Installer v3"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"

# ─── Root check ──────────────────────────────────────────────────────────────
[ "$EUID" -ne 0 ] && die "Please run as root:  sudo bash install.sh"

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Step 1: Inputs ──────────────────────────────────────────────────────────
echo -e "${BOLD}Step 1 — Configuration${NC}\n"

while true; do
    read -rp "🤖 Telegram Bot Token (from @BotFather): " BOT_TOKEN
    [[ -n "$BOT_TOKEN" ]] && break
    warn "Token cannot be empty."
done

while true; do
    read -rp "👤 Admin Telegram ID (numeric): " ADMIN_ID
    [[ "$ADMIN_ID" =~ ^[0-9]+$ ]] && break
    warn "Must be a numeric Telegram ID."
done

read -rp "👤 Second Admin ID (optional, Enter to skip): " ADMIN_ID_2
if [[ -n "$ADMIN_ID_2" && ! "$ADMIN_ID_2" =~ ^[0-9]+$ ]]; then
    warn "Invalid — skipping."; ADMIN_ID_2=""
fi
ADMIN_IDS="${ADMIN_ID}${ADMIN_ID_2:+,$ADMIN_ID_2}"

while true; do
    read -rp "🌐 Public Domain (e.g. tisabuy.com — WITHOUT https://): " PUBLIC_DOMAIN
    # strip protocol if accidentally entered
    PUBLIC_DOMAIN="${PUBLIC_DOMAIN#https://}"; PUBLIC_DOMAIN="${PUBLIC_DOMAIN#http://}"
    PUBLIC_DOMAIN="${PUBLIC_DOMAIN%/}"
    [[ -n "$PUBLIC_DOMAIN" ]] && break
    warn "Domain is required (used for HTTPS, mini-app, webhooks)."
done

echo ""
ok "Bot Token:     ${BOT_TOKEN:0:12}…"
ok "Admin IDs:     ${ADMIN_IDS}"
ok "Public Domain: ${PUBLIC_DOMAIN}"
echo ""

# ─── Step 2: Detect OS ───────────────────────────────────────────────────────
detect_os() {
    [ -f /etc/os-release ] && { . /etc/os-release; echo "${ID:-unknown}"; return; }
    command -v apt-get &>/dev/null && echo debian && return
    command -v yum    &>/dev/null && echo centos  && return
    echo unknown
}
OS=$(detect_os)
info "OS detected: $OS"

pkg_install() {
    case "$OS" in
        ubuntu|debian|raspbian)
            export DEBIAN_FRONTEND=noninteractive
            apt-get install -y "$@" >/dev/null 2>&1 ;;
        centos|rhel|rocky|almalinux)
            yum install -y "$@" >/dev/null 2>&1 ;;
        fedora)
            dnf install -y "$@" >/dev/null 2>&1 ;;
        *) die "Unsupported OS '$OS'. Install packages manually." ;;
    esac
}

# ─── Step 3: Node.js 22 ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 2 — Node.js 22${NC}"
NEED_NODE=false
if ! command -v node &>/dev/null; then NEED_NODE=true
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
            apt-get install -y nodejs >/dev/null 2>&1 ;;
        centos|rhel|rocky|almalinux|fedora)
            curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
            yum install -y nodejs >/dev/null 2>&1 ;;
        *) die "Cannot auto-install Node.js on '$OS'. Install Node.js 22+ manually." ;;
    esac
fi
ok "Node.js $(node -v) ready"

# ─── Step 4: pnpm ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 3 — pnpm${NC}"
command -v pnpm &>/dev/null || npm install -g pnpm --silent
ok "pnpm $(pnpm -v) ready"

# ─── Step 5: PostgreSQL ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 4 — PostgreSQL${NC}"
if ! command -v psql &>/dev/null; then
    info "Installing PostgreSQL..."
    case "$OS" in
        ubuntu|debian|raspbian)
            export DEBIAN_FRONTEND=noninteractive
            apt-get update -qq >/dev/null 2>&1
            apt-get install -y postgresql postgresql-contrib >/dev/null 2>&1 ;;
        centos|rhel|rocky|almalinux)
            yum install -y postgresql-server postgresql-contrib >/dev/null 2>&1
            postgresql-setup --initdb >/dev/null 2>&1 || true ;;
        fedora)
            dnf install -y postgresql-server postgresql-contrib >/dev/null 2>&1
            postgresql-setup --initdb >/dev/null 2>&1 || true ;;
        *) die "Cannot auto-install PostgreSQL on '$OS'." ;;
    esac
fi
systemctl enable postgresql >/dev/null 2>&1 || true
systemctl start  postgresql >/dev/null 2>&1 || service postgresql start >/dev/null 2>&1 || true
sleep 2
ok "PostgreSQL running"

DB_NAME="anchatbot"; DB_USER="anchatbot"
DB_PASS="$(openssl rand -hex 14 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(14))')"
DB_HOST="localhost"; DB_PORT="5432"

info "Creating database '$DB_NAME'..."
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null \
    || sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null \
    || sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' \n')
if [ -n "$PG_HBA" ] && [ -f "$PG_HBA" ]; then
    if ! grep -qE "^host.*${DB_NAME}.*${DB_USER}.*(md5|scram)" "$PG_HBA" 2>/dev/null; then
        printf "host    %-20s %-20s 127.0.0.1/32    md5\n" "${DB_NAME}" "${DB_USER}" >> "$PG_HBA"
        printf "host    %-20s %-20s ::1/128         md5\n" "${DB_NAME}" "${DB_USER}" >> "$PG_HBA"
        systemctl reload postgresql >/dev/null 2>&1 || service postgresql reload >/dev/null 2>&1 || true
        sleep 1
    fi
fi
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT 1;" >/dev/null 2>&1 && ok "Database connection verified" \
    || warn "DB connection check failed — will retry at runtime"

# ─── Step 6: Write .env ──────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 5 — Environment file${NC}"
ENV_FILE="${INSTALL_DIR}/.env"
cat > "$ENV_FILE" << ENVEOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
ADMIN_IDS=${ADMIN_IDS}
DATABASE_URL=${DATABASE_URL}
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
NODE_ENV=production
PORT=8080
ENVEOF
ok ".env created at $ENV_FILE"

export TELEGRAM_BOT_TOKEN="$BOT_TOKEN" ADMIN_IDS="$ADMIN_IDS"
export DATABASE_URL="$DATABASE_URL" PUBLIC_DOMAIN="$PUBLIC_DOMAIN"
export NODE_ENV="production" PORT="8080"

# ─── Step 7: JS dependencies ─────────────────────────────────────────────────
echo -e "\n${BOLD}Step 6 — Node.js dependencies${NC}"
cd "$INSTALL_DIR"
info "Running pnpm install..."
pnpm install --frozen-lockfile 2>&1 | grep -E "ERR|error|added|Done" | tail -5 || true
ok "Dependencies installed"

# ─── Step 8: Build ───────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 7 — Build${NC}"
info "Building..."
cd "${INSTALL_DIR}/artifacts/api-server"
pnpm run build
cd "$INSTALL_DIR"
ok "Build complete"

# ─── Step 9: DB schema ───────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 8 — Database schema${NC}"
info "Pushing schema..."
pnpm --filter @workspace/db run push-force 2>&1 | tail -5 \
    || { yes 2>/dev/null | pnpm --filter @workspace/db run push 2>&1 | tail -5 \
        || die "Database schema push failed."; }
ok "Database schema applied"

# Safe migrations (no-op if already done)
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "ALTER TABLE backup_config RENAME COLUMN schedule_hours TO schedule_minutes;" \
    >/dev/null 2>&1 || true
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'call_cost';" \
    >/dev/null 2>&1 || true

# ─── Step 10: PM2 ────────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 9 — Process manager (PM2)${NC}"
command -v pm2 &>/dev/null || npm install -g pm2 --silent
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

STARTUP_CMD=$(pm2 startup 2>/dev/null | grep -E "^sudo|^env PATH" | head -1 || true)
[ -n "$STARTUP_CMD" ] && eval "$STARTUP_CMD" >/dev/null 2>&1 || true
ok "Bot started with PM2 (auto-start on reboot)"

# ─── Step 11: nginx ──────────────────────────────────────────────────────────
echo -e "\n${BOLD}Step 10 — nginx (reverse proxy)${NC}"
if ! command -v nginx &>/dev/null; then
    info "Installing nginx..."
    case "$OS" in
        ubuntu|debian|raspbian) pkg_install nginx ;;
        centos|rhel|rocky|almalinux) pkg_install nginx ;;
        fedora) pkg_install nginx ;;
    esac
fi
systemctl enable nginx >/dev/null 2>&1 || true

# Write nginx config (HTTP only for now — HTTPS added after certbot)
NGINX_CONF="/etc/nginx/sites-available/anchatbot"
[ -d /etc/nginx/sites-available ] || NGINX_CONF="/etc/nginx/conf.d/anchatbot.conf"

cat > "$NGINX_CONF" << NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${PUBLIC_DOMAIN};

    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
NGINXEOF

# Enable site (Debian/Ubuntu)
if [ -d /etc/nginx/sites-enabled ]; then
    ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/anchatbot" 2>/dev/null || true
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
fi

nginx -t >/dev/null 2>&1 && systemctl restart nginx >/dev/null 2>&1 \
    || { warn "nginx config test failed — check /etc/nginx/"; }
ok "nginx configured for ${PUBLIC_DOMAIN}"

# ─── Step 12: SSL (Let's Encrypt) ────────────────────────────────────────────
echo -e "\n${BOLD}Step 11 — SSL (Let's Encrypt)${NC}"
if ! command -v certbot &>/dev/null; then
    info "Installing certbot..."
    case "$OS" in
        ubuntu|debian|raspbian)
            apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 ;;
        centos|rhel|rocky|almalinux)
            yum install -y epel-release >/dev/null 2>&1 || true
            yum install -y certbot python3-certbot-nginx >/dev/null 2>&1 ;;
        fedora)
            dnf install -y certbot python3-certbot-nginx >/dev/null 2>&1 ;;
    esac
fi

# Check if domain resolves to this server's IP
SERVER_IP=$(curl -s --max-time 5 https://ifconfig.me/ip 2>/dev/null || echo "")
DOMAIN_IP=$(dig +short "${PUBLIC_DOMAIN}" A 2>/dev/null | head -1 || host "${PUBLIC_DOMAIN}" 2>/dev/null | grep "has address" | head -1 | awk '{print $NF}' || echo "")

if [ -n "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ] && [ "$SERVER_IP" = "$DOMAIN_IP" ]; then
    info "Domain ${PUBLIC_DOMAIN} → ${SERVER_IP} ✓ — Getting SSL certificate..."
    if certbot --nginx -d "${PUBLIC_DOMAIN}" --non-interactive --agree-tos \
               --email "admin@${PUBLIC_DOMAIN}" --redirect >/dev/null 2>&1; then
        ok "SSL certificate installed for ${PUBLIC_DOMAIN}"
    else
        warn "certbot failed — trying standalone mode..."
        systemctl stop nginx >/dev/null 2>&1 || true
        if certbot certonly --standalone -d "${PUBLIC_DOMAIN}" --non-interactive \
                    --agree-tos --email "admin@${PUBLIC_DOMAIN}" >/dev/null 2>&1; then
            # Write full HTTPS nginx config manually
            cat > "$NGINX_CONF" << NGINX_SSL
server {
    listen 80;
    listen [::]:80;
    server_name ${PUBLIC_DOMAIN};
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${PUBLIC_DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PUBLIC_DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    client_max_body_size 50M;
    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
NGINX_SSL
            nginx -t >/dev/null 2>&1 && systemctl start nginx >/dev/null 2>&1
            ok "SSL certificate installed (standalone)"
        else
            systemctl start nginx >/dev/null 2>&1 || true
            warn "SSL failed — the bot runs on HTTP. Run certbot manually after DNS propagates."
        fi
    fi
    # Auto-renew via cron
    (crontab -l 2>/dev/null | grep -v certbot; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab - 2>/dev/null || true
else
    warn "DNS not yet pointing to this server (server=$SERVER_IP, domain=$DOMAIN_IP)"
    warn "SSL skipped — run after DNS propagates: certbot --nginx -d ${PUBLIC_DOMAIN}"
fi

# ─── Step 13: coturn (TURN server for WebRTC calls) ─────────────────────────
echo -e "\n${BOLD}Step 12 — coturn (TURN server for WebRTC)${NC}"
if ! command -v turnserver &>/dev/null; then
    info "Installing coturn..."
    case "$OS" in
        ubuntu|debian|raspbian) pkg_install coturn ;;
        centos|rhel|rocky|almalinux)
            yum install -y epel-release >/dev/null 2>&1 || true
            yum install -y coturn >/dev/null 2>&1 ;;
        fedora) pkg_install coturn ;;
    esac
fi

# Static credentials (simpler than HMAC — works directly with the bot)
TURN_USERNAME="anchatbot_turn"
TURN_PASSWORD="$(openssl rand -hex 20 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(20))')"
TURN_EXT_IP="${SERVER_IP:-$(curl -s --max-time 5 https://ifconfig.me/ip 2>/dev/null || echo ${PUBLIC_DOMAIN})}"

# Write coturn config
TURN_CONF="/etc/turnserver.conf"
cat > "$TURN_CONF" << TURNEOF
listening-port=3478
tls-listening-port=5349
external-ip=${TURN_EXT_IP}
server-name=${PUBLIC_DOMAIN}
realm=${PUBLIC_DOMAIN}
fingerprint
lt-cred-mech
user=${TURN_USERNAME}:${TURN_PASSWORD}
min-port=49152
max-port=65535
TURNEOF

# Add TLS cert if available
if [ -f "/etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem" ]; then
    echo "cert=/etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem" >> "$TURN_CONF"
    echo "pkey=/etc/letsencrypt/live/${PUBLIC_DOMAIN}/privkey.pem"   >> "$TURN_CONF"
fi

# Enable and start coturn
if [ -f /etc/default/coturn ]; then
    sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || \
    echo "TURNSERVER_ENABLED=1" >> /etc/default/coturn
fi
systemctl enable coturn >/dev/null 2>&1 || true
systemctl restart coturn >/dev/null 2>&1 || service coturn restart >/dev/null 2>&1 || true
sleep 2

if systemctl is-active --quiet coturn 2>/dev/null || service coturn status >/dev/null 2>&1; then
    ok "coturn TURN server running on port 3478"
else
    warn "coturn may not be running — check: systemctl status coturn"
fi

# Save TURN credentials to .env (auto-seeded into DB on startup)
echo "TURN_USERNAME=${TURN_USERNAME}" >> "$ENV_FILE"
echo "TURN_PASSWORD=${TURN_PASSWORD}" >> "$ENV_FILE"
export TURN_USERNAME TURN_PASSWORD

# ─── Step 14: Health check ───────────────────────────────────────────────────
echo -e "\n${BOLD}Step 13 — Health check${NC}"
sleep 6

BOT_STATUS=$(pm2 show anchatbot 2>/dev/null | grep -E "status\s*│" | awk '{print $NF}' | tr -d '│ ' || echo "")
[[ "$BOT_STATUS" == "online" ]] && ok "Bot process ONLINE ✔" \
    || warn "Bot status: '${BOT_STATUS:-unknown}' — check: pm2 logs anchatbot"

# Test HTTP endpoint
if curl -sf "http://localhost:8080/api/call/config" >/dev/null 2>&1; then
    ok "API responding on port 8080"
else
    warn "API not responding yet — may still be starting"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "═══════════════════════════════════════════════════"
echo "   🎉 Installation complete!"
echo "═══════════════════════════════════════════════════"
echo -e "${NC}"
printf "  %-24s %s\n" "Bot Token:"        "${BOT_TOKEN:0:12}…"
printf "  %-24s %s\n" "Admin IDs:"        "${ADMIN_IDS}"
printf "  %-24s %s\n" "Domain:"           "${PUBLIC_DOMAIN}"
printf "  %-24s %s\n" "Mini App URL:"     "https://${PUBLIC_DOMAIN}/call/"
printf "  %-24s %s\n" "DB:"               "${DB_HOST}:${DB_PORT}/${DB_NAME}"
printf "  %-24s %s\n" "DB Password:"      "${DB_PASS}"
printf "  %-24s %s\n" "TURN Secret:"      "${TURN_SECRET:0:16}…"
printf "  %-24s %s\n" "Plisio webhook:"   "https://${PUBLIC_DOMAIN}/webhook/plisio?json=true"
printf "  %-24s %s\n" "TetraPay webhook:" "https://${PUBLIC_DOMAIN}/webhook/tetrapay"
echo ""
echo -e "${BOLD}  PM2 commands:${NC}"
echo "    pm2 status                — وضعیت پروسه"
echo "    pm2 logs anchatbot        — لاگ زنده"
echo "    pm2 restart anchatbot     — ری‌استارت"
echo "    pm2 stop anchatbot        — توقف"
echo ""
echo -e "${BOLD}  First steps in Telegram:${NC}"
echo "    1. Open your bot → send /start"
echo "    2. /admin → پنل ادمین"
echo "    3. /admin → هزینه‌ها → 📞 تماس ناشناس  (auto-configured)"
echo "    4. /admin → پرداخت → Plisio → 🔗 تشخیص خودکار Callback URL"
echo "    5. /admin → پرداخت → TetraPay → 🔄 تشخیص خودکار URL"
echo ""
echo -e "${BOLD}  TURN Server (for WebRTC):${NC}"
echo "    Host:   ${PUBLIC_DOMAIN}"
echo "    Port:   3478"
echo "    Secret: ${TURN_SECRET:0:20}…  (auto-configured in bot)"
echo ""
echo "═══════════════════════════════════════════════════"
