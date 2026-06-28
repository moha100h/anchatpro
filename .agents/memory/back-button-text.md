---
name: Back button text consistency
description: The fa.ts back key is "🔙 بازگشت" (bāzgasht), NOT "🔙 برگشت" (bargasht). Handlers must use regex not exact strings.
---

## The Rule
`fa.ts` defines `back: "🔙 بازگشت"` — the word is *bāzgasht* (بازگشت).

Handlers must use **regex** `/^🔙 بازگشت/` not exact string `"🔙 برگشت"` (bargasht) — these are different Persian words.

**Why:** `matching.ts` used the wrong string `"🔙 برگشت"`, so users in the queue pressing Back were NOT removed from the queue — they silently stayed stuck while the main menu appeared via the settings.ts catch-all.

## Handler chain order (matching.ts registered before settings.ts)
1. `matching.ts` `/^🔙 بازگشت/` — if user in queue → cancel + main menu; if in chat/group → next(); else → main menu
2. `settings.ts` `/^🔙 بازگشت/` (catch-all) — clears ALL session state: setupStep, magicStep, magicChainId, session.step, adminAction, giftCodeInput → main menu

## How to apply
- Every `bot.hears` for the back button must use `/^🔙 بازگشت/` (regex, not string)
- `settings.ts` catch-all MUST be registered AFTER all other modules that need to intercept back first
- Never use exact string `"🔙 برگشت"` — that will never match
