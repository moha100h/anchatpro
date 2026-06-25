# Telegram Anonymous Chat Bot

A professional, high-performance Telegram Anonymous Dating & Chat Bot built with Grammy, TypeScript, PostgreSQL, and Drizzle ORM.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + Telegram bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `TELEGRAM_BOT_TOKEN`, `ADMIN_IDS`, `DATABASE_URL` (auto-provisioned), `BOT_USERNAME`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Telegram Bot: Grammy v1, @grammyjs/conversations
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod v4
- Scheduling: node-cron
- Logging: Pino

## Where things live

- `artifacts/api-server/src/bot/` — All bot logic
  - `handlers/` — Command and message handlers (start, matching, group, anonymous-link, coins, admin, help, settings)
  - `services/` — Business logic (user, matching, coin, payment, backup, broadcast, safety)
  - `keyboards/` — Telegram keyboards (main reply keyboard, inline keyboards)
  - `middleware/` — Auth middleware and rate limiter
  - `i18n/` — Persian (fa) and English (en) translations
- `lib/db/src/schema/` — Drizzle ORM schema (users, chats, groups, coins, payments, reports, settings)

## Architecture decisions

- Grammy bot runs inside the same Express process for simplicity and resource efficiency
- Sessions stored in-memory (Grammy default); upgrading to DB storage is straightforward
- All user identity protected — anonymous tokens, no partner ID leakage
- Rate limiting in-memory for fast checks, DB for persistence
- Admin panel is Telegram-based — no web frontend needed

## Product

- Anonymous 1-on-1 matching with gender preference and coin gating
- Anonymous group chats (3–10 users) with coin gating
- Anonymous link system for asynchronous anonymous messaging
- Full coin economy (referral, purchase, admin management)
- Payment system (card/crypto/gateway) with Telegram-based admin review
- Scheduled automatic backups to a Telegram group
- Broadcast system for admin mass messaging
- Content safety (bad words, rate limiting, warnings, bans)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — libs must be compiled first
- DB schema must be pushed after schema changes: `pnpm --filter @workspace/db run push`
- BOT_USERNAME must match the actual bot username (no @) for anonymous links to work correctly
- Admin IDs: comma-separated list in ADMIN_IDS env var

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
