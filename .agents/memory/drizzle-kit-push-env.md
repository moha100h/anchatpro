---
name: drizzle-kit push CWD/env gap
description: drizzle.config.ts must explicitly load repo-root .env, not rely on caller's shell env
---
Running `pnpm --filter @workspace/db run push` (or `push-force`) sets CWD to that package's directory (e.g. `lib/db`), not the monorepo root. `drizzle.config.ts` reading `process.env.DATABASE_URL` directly only works if the *calling shell* happened to export it — it does NOT auto-load a `.env` file sitting at the repo root.

**Why:** A VPS installer (`install.sh`) exports `DATABASE_URL` within its own script process before calling the push script, so the very first run works. But any later manual re-run (`ssh` in, `cd ~/project && pnpm --filter @workspace/db run push-force`) happens in a fresh shell with no exported var, so drizzle-kit fails with "DATABASE_URL, ensure the database is provisioned" — confusing because "it worked during install."

**How to apply:** In `drizzle.config.ts`, explicitly call `dotenv.config({ path: path.join(__dirname, "../../.env") })` (adjust relative depth to repo root) before reading `process.env.DATABASE_URL`. Do the same for any app entrypoint that depends on env vars set via a `.env` file rather than a process manager's captured environment.
