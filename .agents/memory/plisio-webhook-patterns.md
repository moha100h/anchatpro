---
name: Plisio webhook patterns
description: Durable rules for the Plisio crypto-gateway webhook — status mapping, review-group scope, and the pending-status trap.
---

# Plisio webhook patterns

## Review-group notification scope (product decision)
Full payment info is archived to the review group ONLY for:
- **successful** payments (`completed`) — via `notifyPlisioReviewGroup`
- **incomplete/mismatch** payments (`mismatch`) — via `notifyPlisioReviewGroupMismatch`

`expired` / `cancelled` / `failed` / `error` → user is notified but NOT archived to the group.
**Why:** the owner only manually reviews money that actually moved (success) or moved with a wrong amount (mismatch). Failed/expired/cancelled had no funds transfer worth archiving.
**How to apply:** the user gets a message for every terminal status (`NOTIFY_STATUSES`); only success + mismatch also hit the review group.

## "incomplete" == Plisio "mismatch"
When the owner says "incomplete/ناقص" payment, that maps to Plisio's `mismatch` status (under/overpaid), NOT to `pending`/`new`. There is no separate "awaiting confirmation" message in scope — don't add one unless explicitly asked.

## The pending-status trap (do NOT gate one-time notifications on statusChanged)
`plisio_transactions.status` defaults to `"pending"` AND the row is created with `"pending"` at invoice time. So the first real `pending` webhook has `tx.status === "pending"` already → any `statusChanged = tx.status !== mapped` check is FALSE on the first callback.
Also `createPlisioOrder()` stores the `txn_id` from `/invoices/new` at creation, so `!tx.txnId` is often already false before any webhook.
**Why:** both signals (status transition, txn_id-first-seen) are unreliable for detecting "user just paid" because the initial row already carries both. Attempts to send a once-only "payment received" message off either signal silently never fire (or spam).
**How to apply:** if a one-time pending/interim notification is ever required, add a dedicated persisted marker (e.g. a `pendingNotifiedAt` column set atomically once) — never infer it from status or txn_id presence.

## USD vs crypto currency in messages
`plisio_transactions.currency` holds a CRYPTO code (e.g. ETH/TRX), NOT "USD". `amountUsd` is the invoice USD amount. In group messages always label `amountUsd` as `USD` and show the actual crypto (`payload.amount` + `payload.currency`) on a separate line. Extract crypto fields with `!= null` (not truthy) so a `0` isn't dropped.

## Status enum
`plisioStatusEnum = ["pending","completed","expired","failed","cancelled","mismatch","error"]` — no "new"/"initiated" state; Plisio `new`/`pending internal` all map to `pending`.
