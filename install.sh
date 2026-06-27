#!/bin/bash

set -e

echo "================================================="
echo "  Telegram Anonymous Chat Bot - Installer"
echo "================================================="
echo ""

# ─── 1. Collect only the two required inputs ────────────────────────────────

read -p "🤖 Telegram Bot Token (from @BotFather): " BOT_TOKEN
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Bot token is required."
    exit 1
fi

read -p "👤 Admin Telegram ID (numeric, e.g. 123456789): " ADMIN_IDS
if [ -z "$ADMIN_IDS" ]; then
    echo "❌ Admin ID is required."
    exit 1
fi

# Validate that ADMIN_IDS is numeric
if ! [[ "$ADMIN_IDS" =~ ^[0-9,]+$ ]]; then
    echo "❌ Admin ID must be numeric (e.g. 123456789)."
    exit 1
fi

echo ""

# ─── 2. Detect OS ────────────────────────────────────────────────────────────

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    elif command -v apt-get >/dev/null 2>&1; then
        echo "debian"
    elif command -v yum >/dev/null 2>&1; then
        echo "centos"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)

# ─── 3. Install Node.js 20 if needed ─────────────────────────────────────────

if ! command -v node >/dev/null 2>&1 || [ "$(node -e 'process.stdout.write(process.version.split(".")[0].replace("v",""))')" -lt 20 ]; then
    echo "📦 Installing Node.js 20..."
    case "$OS" in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
            apt-get install -y nodejs >/dev/null 2>&1
            ;;
        centos|rhel|fedora|rocky|almalinux)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
            yum install -y nodejs >/dev/null 2>&1
            ;;
        *)
            echo "❌ Please install Node.js 20+ manually and re-run this script."
            exit 1
            ;;
    esac
    echo "✅ Node.js $(node -v) installed"
else
    echo "✅ Node.js $(node -v) already installed"
fi

# ─── 4. Install pnpm if needed ───────────────────────────────────────────────

if ! command -v pnpm >/dev/null 2>&1; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm >/dev/null 2>&1
    echo "✅ pnpm installed"
else
    echo "✅ pnpm already installed"
fi

# ─── 5. Install & configure PostgreSQL automatically ─────────────────────────

DB_NAME="anchatbot"
DB_USER="anchatbot"
DB_PASS="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)"
DB_HOST="localhost"
DB_PORT="5432"

if ! command -v psql >/dev/null 2>&1; then
    echo "📦 Installing PostgreSQL..."
    case "$OS" in
        ubuntu|debian)
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
            echo "❌ Please install PostgreSQL manually and re-run."
            exit 1
            ;;
    esac
    systemctl enable postgresql >/dev/null 2>&1 || true
    systemctl start postgresql >/dev/null 2>&1 || true
    echo "✅ PostgreSQL installed and started"
else
    # Make sure it's running
    systemctl start postgresql >/dev/null 2>&1 || service postgresql start >/dev/null 2>&1 || true
    echo "✅ PostgreSQL already installed"
fi

echo "🗄️  Creating database user and database..."

# Create DB user and database via postgres superuser
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || \
    sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || true

sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || \
    sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};" 2>/dev/null || true

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" 2>/dev/null || true

# Allow local password auth — add pg_hba.conf entry if not present
PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file;" 2>/dev/null | tr -d ' ')
if [ -n "$PG_HBA" ] && [ -f "$PG_HBA" ]; then
    if ! grep -q "^host.*${DB_NAME}.*${DB_USER}.*md5\|^host.*${DB_NAME}.*${DB_USER}.*scram" "$PG_HBA" 2>/dev/null; then
        echo "host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    md5" >> "$PG_HBA"
        echo "host    ${DB_NAME}    ${DB_USER}    ::1/128         md5" >> "$PG_HBA"
        systemctl reload postgresql >/dev/null 2>&1 || service postgresql reload >/dev/null 2>&1 || true
    fi
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Verify connection works
if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "✅ Database connection verified"
else
    echo "⚠️  Could not verify DB connection — continuing anyway. Check logs if bot fails to start."
fi

# ─── 6. Write .env ───────────────────────────────────────────────────────────

echo ""
echo "📝 Writing .env..."
cat > .env << EOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
ADMIN_IDS=${ADMIN_IDS}
DATABASE_URL=${DATABASE_URL}
NODE_ENV=production
PORT=5000
EOF
echo "✅ .env created"

# ─── 7. Install JS dependencies ──────────────────────────────────────────────

echo ""
echo "📦 Installing project dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -5
echo "✅ Dependencies installed"

# ─── 8. Apply DB schema ──────────────────────────────────────────────────────

echo ""
echo "🗄️  Applying database schema..."
if pnpm --filter @workspace/db run push; then
    echo "✅ Database schema applied"
else
    echo "❌ DB schema push failed. Check DATABASE_URL and PostgreSQL connection."
    exit 1
fi

# ─── 9. Build ────────────────────────────────────────────────────────────────

echo ""
echo "🔨 Building project..."
pnpm --filter @workspace/api-server run build
echo "✅ Build complete"

# ─── 10. Setup PM2 for auto-restart ──────────────────────────────────────────

if ! command -v pm2 >/dev/null 2>&1; then
    echo ""
    echo "📦 Installing PM2 (process manager)..."
    npm install -g pm2 >/dev/null 2>&1
fi

pm2 delete anchatbot >/dev/null 2>&1 || true
pm2 start "pnpm --filter @workspace/api-server run start" \
    --name anchatbot \
    --restart-delay=3000 \
    --max-restarts=10 >/dev/null 2>&1
pm2 save >/dev/null 2>&1 || true
pm2 startup 2>/dev/null | tail -1 | bash >/dev/null 2>&1 || true

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "================================================="
echo "✅ Installation complete! Bot is now running."
echo ""
echo "📋 Connection details (saved in .env):"
echo "   DB Name : ${DB_NAME}"
echo "   DB User : ${DB_USER}"
echo "   DB Host : ${DB_HOST}:${DB_PORT}"
echo ""
echo "📌 Useful commands:"
echo "   pm2 status              — view bot status"
echo "   pm2 logs anchatbot      — view bot logs"
echo "   pm2 restart anchatbot   — restart bot"
echo "   pm2 stop anchatbot      — stop bot"
echo ""
echo "🤖 Open your bot in Telegram and:"
echo "   1. Send /start to register"
echo "   2. Send /admin to open the admin panel"
echo "   3. In Admin ← Payment ← TetraPay: press 🔄 Auto-detect URL"
echo "      to set the callback URL automatically."
echo "================================================="
