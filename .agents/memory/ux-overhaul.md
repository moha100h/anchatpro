---
name: UX Overhaul Patterns
description: Key decisions from the comprehensive UX overhaul — gender labels, ocean rename, persistent menus, group/link features, migration quirk.
---

## Gender label change
- `مرد` → `پسر`, `زن` → `دختر` in fa.ts
- Gender hears regex must include BOTH old+new: `/^(👦 پسر|👧 دختر|👦 مرد|👧 زن|🌈 سایر|👦 Male|👧 Female|🌈 Other)$/`
- Gender detection logic: check `includes("پسر") || includes("مرد")` for male

## Ocean → 🔮 دنیای اسرار
- `menuMagic: "🔮 دنیای اسرار"` in fa.ts
- magic.ts hears: `[/^🔮 دنیای/, /^🔮 World/, /^🌊 اقیانوس/, /^🌊 Ocean/]` (backward compat)
- matching.ts SKIP_FORWARD_RE must include `🔮`
- admin.ts panel button updated to 🔮

## Persistent sub-menus
- coinsSubMenuKeyboard, inviteMenuKeyboard, groupSubMenuKeyboard, groupAdminKeyboard, myLinkMenuKeyboard, timedLinkKeyboard, magicHelpMenuKeyboard all in keyboards/main.ts
- "💰 سکه‌های من" now shows coinsSubMenuKeyboard, not inline buttons
- "🎁 دعوت" now shows inviteMenuKeyboard
- "🔗 لینک ناشناس من" now shows myLinkMenuKeyboard

## Group system
- groups.ts schema: `name`, `inviteToken` (varchar 32), `isAdmin` on members
- createGroup() returns `{ groupId, inviteToken }` — inviteToken always generated
- joinOrCreateGroup() excludes groups where inviteToken IS NOT NULL (private groups)
- Group invite link: `?start=g_{token}` → handled in start.ts before anon link check
- Max 2 promoted admins per group; isGroupAdmin() checks isCreator OR isAdmin

## Timed anonymous links
- timedAnonLinksTable: userId, token (varchar 24), coinsCost, expiresAt, notified
- Timed link: `?start=t_{token}` → validated in start.ts; expired = show error
- Token generated via `randomBytes(12).toString("hex")` (24 chars)

## drizzle-kit push migration quirk
**Why:** Adding a UNIQUE constraint to a table with existing rows triggers drizzle-kit's interactive confirm prompt (even with --force), which fails without a TTY.
**Fix:** Run ALTER TABLE SQL directly via executeSql() in code_execution notebook instead.

## Admin settings keys (all via getSetting())
- `referral_reward_inviter` (default 5) — coins for inviter
- `referral_reward_invitee` (default 0) — coins for new user  
- `support_link` — support contact URL
- `group_admin_promote_cost` (default 5)
- `group_expand_cost` (default 10)

## processReferralReward return type
Returns `{ referrerId, inviterCoins, inviteeCoins } | null` — both parties notified in start.ts after setup completion.
