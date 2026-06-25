# Telegram Anonymous Chat Bot

A professional, high-performance Telegram Anonymous Dating & Chat Bot built with Grammy, TypeScript, PostgreSQL, and Drizzle ORM.

## Features

- 🔗 **Anonymous 1-on-1 Chat** — Smart gender-based matching with queue system
- 👥 **Anonymous Group Chat** — Dynamic groups of 3–10 users
- 🔗 **Anonymous Link** — Unique shareable links for receiving anonymous messages
- 💰 **Coin Economy** — Full coin system with purchases, referrals, and spending
- 🎁 **Referral System** — Earn 5 coins per successful referral with tree tracking
- 💳 **Payment System** — Card, crypto, and gateway support with admin review
- 👑 **Admin Panel** — Telegram-based full admin panel
- 📢 **Broadcast** — Send messages to all or active users
- 💾 **Auto Backup** — Scheduled database backups to a Telegram group
- 🛡️ **Content Safety** — Bad word filter, rate limiting, warnings, bans
- 🌐 **Multilingual** — Full Persian (فارسی) and English support

## Requirements

- Node.js 20+
- PostgreSQL 14+
- pnpm

## Quick Install

```bash
chmod +x install.sh
./install.sh
```

The installer will ask for:
1. Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
2. Admin Telegram ID (numeric)
3. PostgreSQL Database URL

## Manual Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Environment variables

Create a `.env` file:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
ADMIN_IDS=123456789,987654321
DATABASE_URL=postgresql://user:password@localhost:5432/botdb
BOT_USERNAME=YourBotUsername
NODE_ENV=production
PORT=5000
```

### 3. Database setup

```bash
pnpm --filter @workspace/db run push
```

### 4. Build & start

```bash
# Development
pnpm --filter @workspace/api-server run dev

# Production build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

### 5. Auto-restart with PM2

```bash
npm install -g pm2
pm2 start "pnpm --filter @workspace/api-server run start" --name telegram-bot
pm2 save
pm2 startup
```

## Admin Commands

All admin commands are available to users listed in `ADMIN_IDS`.

| Command | Description |
|---------|-------------|
| `/admin` | Open admin panel with statistics |
| `/verify_backup <code>` | Verify backup group (run in group) |

### Admin Panel Features

- **📊 Statistics** — Total users, active users, chats, transactions, pending reports
- **👤 User Search** — Search by Telegram ID, view profile, manage coins, ban/unban
- **📢 Broadcast** — Send to all users or active users (last 7 days)
- **💾 Backup** — Configure backup group, schedule, and manual backup
- **💳 Payment Settings** — Card number, crypto wallet, review group, enable/disable methods
- **🌳 Referral Tree** — View referral chain for any user
- **🔤 Bad Words** — Add custom bad words to filter

## Payment Setup

1. Open Admin Panel (`/admin`)
2. Go to **💳 Payment Settings**
3. Set:
   - Card number for card payments
   - Crypto wallet address
   - Admin review group ID (add bot as admin in the group)
4. Enable desired payment methods

### Manual Payment Flow
1. User selects package → selects "Pay by Card"
2. User sends payment receipt (photo)
3. Receipt forwarded to admin review group
4. Admin clicks ✅ Approve or ❌ Reject
5. User notified automatically

## Backup Setup

1. Open Admin Panel (`/admin`) → **💾 Backup Settings**
2. Click **🔑 Generate Code** — get a verification code
3. Add bot as **admin** to your backup Telegram group
4. Send `/verify_backup <code>` in the backup group
5. Set schedule (e.g., every 24 hours)

## Coin System

| Action | Cost/Reward |
|--------|-------------|
| Connect to specific gender | -1 coin |
| Connect to random (any gender) | Free |
| Join anonymous group | -1 coin |
| Successful referral | +5 coins |
| Admin adjustment | Variable |

## Architecture

```
artifacts/api-server/
  src/
    bot/
      handlers/     # Command & message handlers
      services/     # Business logic layer
      keyboards/    # Telegram keyboards
      middleware/   # Auth, rate limiting
      i18n/         # Translations (fa, en)
      index.ts      # Bot initialization
    app.ts          # Express app
    index.ts        # Entry point

lib/
  db/
    src/schema/     # Drizzle ORM schemas
    src/index.ts    # DB connection
```

## Tech Stack

- **Bot Framework**: [Grammy](https://grammy.dev/) v1
- **Runtime**: Node.js 24 + TypeScript 5.9
- **Database**: PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)
- **Validation**: Zod v4
- **Scheduling**: node-cron
- **Logging**: Pino

## Security

- Rate limiting (30 messages / 10 seconds)
- Bad word filtering with configurable word list
- Warning system (3 warnings → 24h restriction → ban)
- Block system prevents re-matching
- Admin-only commands protected by ID whitelist
- Anonymous sessions with no identity leakage
