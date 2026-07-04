---
name: VPS installer hardening rules
description: Non-obvious ordering/robustness constraints for install.sh on fresh minimal VPS
---
Rules learned building the fully-automatic `install.sh` (Node 22 + pnpm monorepo + PostgreSQL + Drizzle + PM2):

- **Install base prerequisites FIRST.** A fresh/minimal VPS may lack `curl`, `git`, `openssl`, `ca-certificates`. Detect OS and run `apt/yum/dnf update+upgrade` + install those tools as "Step 0" BEFORE the credential step — because token validation uses `curl`.
- **Never call `node` before Node is installed.** The token-validation step runs before the Node install step; parse Telegram's getMe JSON with `grep -o '"username":"[^"]*"' | sed`, NOT `node -e`. Only use `node` after the install step (guard version checks behind `command -v node`).
- **Don't assume `sudo` exists.** Minimal Debian/Ubuntu images often ship without `sudo`. Since the installer runs as root, run psql as the postgres OS user via `runuser -u postgres -- psql` (util-linux, always present); fall back to `sudo` then `su postgres -s /bin/sh -c "psql $(printf '%q ' "$@")"`.
- **DB connectivity is a hard gate.** After provisioning, a failed `SELECT 1` must `die` with diagnostics — don't `warn` and continue, or schema-push/build/runtime fail later with confusing errors.

**Why:** These are the failure modes that break a hands-off install on fresh minimal images even when the happy path works on a full/preconfigured server.
