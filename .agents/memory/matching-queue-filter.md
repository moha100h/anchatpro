---
name: Matching queue filter rule
description: Why findMatch must not filter on isInQueue=true — only isInChat=false is the safe guard.
---

## Rule
In `findMatch()`, presence in `matchingQueueTable` is the **authoritative** signal that a user is waiting. Do NOT add `eq(usersTable.isInQueue, true)` as an extra filter.

Only `eq(usersTable.isInChat, false)` is required — to avoid matching someone already in an active chat.

## Why
`isInQueue` is a denormalized flag in `usersTable`. It can fall out of sync with `matchingQueueTable` in two real scenarios:
1. Server restart — in-memory `setTimeout` loops (`tryMatchFromQueue`) are lost; users remain in the queue table with `isInQueue=true` but the flag can drift if any partial update occurs.
2. Any failure between `INSERT matchingQueueTable` and `UPDATE usersTable SET isInQueue=true` in `addToQueue()`.

Adding `isInQueue=true` to the query causes false negatives: valid waiting users are invisible, so nobody ever matches.

## How to apply
- `findMatch` WHERE clause: `ne(userId, me) AND isInChat=false AND (not in blocked list)` — nothing else.
- Race condition protection lives in `createChatSession()` (pre-flight `isInChat` check + returns `null` on conflict), NOT in the candidate query.
