---
name: Backup & restore system
description: Non-obvious rules for backup.service.ts restore accuracy — timestamp modes, exact counting, conflict semantics, backup completeness.
---

# Backup & restore (backup.service.ts)

## All timestamp columns are date-mode (none use `mode:'string'`)
Every `timestamp(...)` in `lib/db/src/schema/` is date-mode, so Drizzle inserts call `value.toISOString()` on it. Passing an ISO **string** (as backup JSON stores) throws `value.toISOString is not a function` and the whole table row/chunk fails.
**Why:** backup serializes timestamps as ISO strings; restore must convert EVERY timestamp column back to `new Date()` before insert — not just `createdAt`.
**How to apply:** in each restore mapper convert all date columns via the `d()` (nullable → Date|null) / `dn()` (notNull → Date, defaults now) helpers. A bug where only `createdAt` was converted silently passed tests when the *other* timestamp fields happened to be null — you must test with **non-null** values in every timestamp column, or the bug hides.

## Exact restore counting relies on driver rowCount, NOT attempted rows
`onConflictDoNothing` does NOT throw on a conflict; Postgres just skips the row. Counting `ok += prepared.length` therefore over-reports (duplicates counted as restored).
**Why:** the task requires reporting *exactly* what was restored. Drizzle node-postgres insert **without** `.returning()` resolves to `{ rowCount }` where `rowCount` = rows actually written (0 on conflict); **with** `.returning()` it resolves to an array. Use an `affected(res, attempted)` helper: array → `.length`, else `res.rowCount`, else fall back to attempted. Skipped-by-conflict rows then correctly report as skipped.

## Conflict strategy: most tables DoNothing, only users+settings DoUpdate
Restore is built for disaster recovery onto a fresh/empty DB (no conflicts → all rows written, counts exact). Restoring onto a populated DB leaves existing rows untouched for DoNothing tables (backup values NOT applied) and reports them as skipped. `users` and `settings` use `onConflictDoUpdate` (backup is source of truth).

## Backup must capture EVERYTHING — no row limits
`sendBackup()` must `db.select()` full tables with no `.limit()`. (Previously coin_transactions/anonymous_messages/reports were capped at 100k/20k/5k, silently making old rows unrecoverable.) Ephemeral tables intentionally NOT backed up: chat_sessions, matching_queue, frequency_queue, magic_usage, broadcast_jobs, rate_limits, backup_config.

## Sequence reset after restore
Serial-id tables need `setval(pg_get_serial_sequence(...))` after restore or future inserts hit duplicate-key. `SELECT setval(...)` cannot have a bare `WHERE` — wrap in a subquery: `SELECT setval(seq, GREATEST(mx,1)) FROM (SELECT pg_get_serial_sequence('"tbl"','id') AS seq, (SELECT COALESCE(MAX(id),0) FROM "tbl") AS mx) q WHERE seq IS NOT NULL`.

## Schema has NO real FK constraints
No `.references()` anywhere, so restore table ordering does not matter for referential integrity. `id` is still preserved on serial tables to keep cross-table relations (e.g. payment→tetrapay) consistent.

## Testing approach
No tsx installed. Bundle a temp test with esbuild **from inside `artifacts/api-server`** (so node_modules resolve) and run against dev DB: build a synthetic backup covering all 25 tables with non-null values everywhere, restore, verify per-field round-trips, then restore a **second** time and assert DoNothing tables report restored=0 / skipped=N (proves exact counting). Clean up synthetic rows (markers well above real ids) before + after.
