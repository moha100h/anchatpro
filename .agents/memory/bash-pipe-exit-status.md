---
name: Bash pipe exit-status trap
description: cmd | tail -N in install scripts always "succeeds" and hides real failures
---
In bash, `if cmd 2>&1 | tail -N; then ...` checks the exit status of the LAST command in the pipeline (`tail`), not of `cmd`. `tail` almost always exits 0, so the `if` branch is taken even when `cmd` genuinely failed — this silently masks real errors (e.g. a DB schema push that actually failed still prints "success").

**Why:** Found in `install.sh` — the DB schema push step always printed "✅ Database schema applied" even when `drizzle-kit push` failed with a real error, because the check was `if pnpm ... | tail -5; then ok ...`. This let the installer proceed with missing tables, and the bot crashed hours/days later with `relation "x" does not exist`.

**How to apply:** Never use `cmd | tail -N` (or `| grep ...`) as the condition of an `if`. Instead: `cmd > "$LOG" 2>&1; EXIT=$?; if [ "$EXIT" -eq 0 ]; then ...`, then tail/grep the log file separately for display. Applies to any bash installer/CI script with pipelines feeding an `if`.
