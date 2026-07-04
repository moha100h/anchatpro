---
name: Telegram getUpdates single-poller conflict
description: same bot token long-polling in two environments causes silent update-delivery conflicts
---
Telegram only allows one active `getUpdates` long-polling consumer per bot token. If the same token is polled from two places at once (e.g. a Replit dev workflow and a production VPS deployment), they fight over updates — one side gets 409 Conflict errors and may receive no messages at all, with no obvious crash (PM2/process manager still shows "online").

**Why:** Diagnosed a case where a VPS bot showed PM2 status "online" but never responded to `/start` — root cause was the Replit dev environment still running the same bot token in parallel.

**How to apply:** Use separate bot tokens for development and production. Before assuming a "won't start" bot report is a code/DB issue, check whether the same token is also running elsewhere (dev workflow, another VPS, local testing) and stop the extra instance.
