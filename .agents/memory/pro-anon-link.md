---
name: Pro Anon Link system
description: Architecture and critical patterns for the Pro Anonymous Link feature (two tiers, inbox, reveal sender, management).
---

## Schema
- `proAnonLinksTable` — one row per link; `tier` enum ("permanent"|"inapp"); `token` unique; `alias` unique nullable; `displayName`, `welcomeMessage`, `isEnabled`, `linkChangesToday`, `lastLinkChangeDate` (YYYY-MM-DD string), `expiresAt` (null = permanent)
- `anonymousMessagesTable` — added 3 columns: `linkType varchar(20) default 'standard' NOT NULL`, `proLinkId integer`, `senderRevealedAt timestamp`
- Regular inbox filters on `linkType = 'standard'`; pro inbox filters on `linkType IN ('pro_perm', 'pro_inapp')`

## Link prefixes
- `ap_TOKEN_OR_ALIAS` = pro permanent (tier="permanent")
- `ai_TOKEN_OR_ALIAS` = pro in-app (tier="inapp")
- Handled in start.ts `/start` handler; sets session step `pro_send:OWNER:LINK_ID:TIER`

## Cost settings (admin_settings keys, all defaults)
- `pro_perm_link_cost` = 50 coins (one-time)
- `pro_inapp_link_cost` = 5 coins (per link)
- `pro_reveal_cost` = 1 coin (in-app only)
- `pro_welcome_cost` = 3 coins (in-app only)
- `pro_change_link_cost` = 3 coins (in-app only)
- Permanent tier: all features free; 2 free link changes per day tracked via `linkChangesToday` + `lastLinkChangeDate`

## Handler registration
- `registerProAnonLinkHandlers(bot)` in `handlers/pro-anon-link.ts`
- Registered in `index.ts` AFTER `registerAnonLinkHandlers` and BEFORE `registerGroupMessageForwarder`
- `hears` patterns: "🔗 ساخت لینک ناشناس پرو", "💎 لینک پرو دائمی", "⚡ لینک درون‌برنامه‌ای", `/^📬 صندوق پرو/`

## New user flow (pending_pro:)
- If new user clicks pro link before setup → session step `pending_pro:OWNER:LINK_ID:TIER`
- After setup completes → converted to `pro_send:OWNER:LINK_ID:TIER`

## Migration note
- drizzle-kit push fails non-interactively when unique constraints exist on non-empty tables
- **Use direct psql SQL** for migrations in this env: `psql "$DATABASE_URL" << 'SQL' ... SQL`

## Keyboards
- `anonProSubMenuKeyboard(lang, proInboxCount)` — persistent, count in button text
- `proLinkManageInlineKeyboard(linkId, tier, enabled, lang)` — inline management
- `proAnonMsgActionsKeyboard(msgId, linkType, lang, revealCost)` — reply/reveal/block/report
- `proInAppDurationKeyboard(lang)` — inline duration picker (1h/6h/24h/7d)
- `proInAppConfirmKeyboard(hours, token, lang)` — confirm in-app creation
