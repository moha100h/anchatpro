#!/bin/bash

set -e

echo "================================================="
echo "  Telegram Anonymous Chat Bot - Installer"
echo "================================================="
echo ""

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 20+ is required. Install it first."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { npm install -g pnpm; }
command -v psql >/dev/null 2>&1 || echo "⚠️  PostgreSQL client not found. Make sure DATABASE_URL is set."

# Prompt for required values
echo "📋 Please provide the following information:"
echo ""

read -p "🤖 Telegram Bot Token (from @BotFather): " BOT_TOKEN
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ Bot token is required."
    exit 1
fi

read -p "👤 Admin Telegram IDs (comma-separated, e.g. 123456789,987654321): " ADMIN_IDS
if [ -z "$ADMIN_IDS" ]; then
    echo "❌ At least one admin ID is required."
    exit 1
fi

read -p "🗄️  Database URL (postgresql://user:pass@host:5432/db): " DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Database URL is required."
    exit 1
fi

read -p "🤖 Bot Username (without @, e.g. MyAnonBot): " BOT_USERNAME
if [ -z "$BOT_USERNAME" ]; then
    echo "❌ Bot username is required."
    exit 1
fi

echo ""
echo "🔧 Installing dependencies..."
pnpm install

echo ""
echo "📝 Creating .env file..."
cat > .env << EOF
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
ADMIN_IDS=${ADMIN_IDS}
DATABASE_URL=${DATABASE_URL}
BOT_USERNAME=${BOT_USERNAME}
NODE_ENV=production
PORT=5000
EOF

echo "✅ .env file created"

echo ""
echo "🗄️  Setting up database..."
if pnpm --filter @workspace/db run push; then
    echo "✅ Database schema applied"
else
    echo "⚠️  DB push failed — set DATABASE_URL manually and run:"
    echo "    pnpm --filter @workspace/db run push"
fi

echo ""
echo "🔨 Building project..."
pnpm --filter @workspace/api-server run build
echo "✅ Build complete"

echo ""
echo "================================================="
echo "✅ Installation complete!"
echo ""
echo "To start the bot:"
echo "  pnpm --filter @workspace/api-server run start"
echo ""
echo "To run in development mode:"
echo "  pnpm --filter @workspace/api-server run dev"
echo ""
echo "Auto-restart with PM2 (recommended for production):"
echo "  npm install -g pm2"
echo "  pm2 start 'pnpm --filter @workspace/api-server run start' --name telegram-bot"
echo "  pm2 save && pm2 startup"
echo ""
echo "After starting, open the bot and:"
echo "  1. Send /admin to open the admin panel"
echo "  2. Go to Payment Settings to configure:"
echo "     - Card number for card payments"
echo "     - USDT TRC20 wallet for crypto payments"
echo "     - Telegram group ID for payment review notifications"
echo "================================================="
