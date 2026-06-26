---
name: Drizzle ORM null vs undefined in set()
description: Critical gotcha — setting a column to null vs undefined in Drizzle update queries
---

# Drizzle ORM: null vs undefined in `.set()`

## The Rule
In Drizzle `.set({})`, `undefined` **skips the field** (no SQL column update). `null` **sets SQL NULL**.

**Why:** setupStep was never cleared because `null ?? undefined = undefined`, so Drizzle silently skipped the column. Every subsequent message stayed trapped in the age-input handler.

## Correct pattern
```ts
// WRONG — does not clear the column
set({ setupStep: null ?? undefined }) // → undefined → skipped

// CORRECT — sets column to NULL
set({ setupStep: null })
```

## Grammy hears chain gotcha
Multiple `bot.hears(samePattern)` handlers form a chain. If an earlier handler returns WITHOUT calling `next()`, subsequent handlers for the same pattern never run. Always `return next()` in step-guards that should defer to later handlers.
