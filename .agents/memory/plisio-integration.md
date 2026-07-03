---
name: Plisio integration
description: Full Plisio crypto gateway integration alongside TetraPay; key design decisions and wiring points.
---

## Key facts

- **Webhook URL**: `/webhook/plisio?json=true` — the `?json=true` suffix is required by Plisio (Status URL field in their panel).
- **Amount currency**: `source_currency=USD`, `source_amount` from `pkg.plisioPrice ?? pkg.cryptoPrice ?? 5`.
- **Webhook verification**: since callback URL includes `?json=true`, Plisio signs with `HMAC-SHA1(JSON.stringify(payload minus verify_hash))` — plain JSON stringify, NOT PHP `serialize()`/sorted-keys. Using the PHP-serialize method makes verification always fail silently and coins never get credited (see plisio-verify-bug.md).
- **DB schema**: `plisioTransactionsTable`, `plisioStatusEnum`, `plisioPrice` column on `paymentPackagesTable`, `payment_method` enum extended with `'plisio'`.
- **Admin settings keys**: `plisio_api_key`, `plisio_callback_url`, `plisio_currencies` (default `ETH,LTC,BNB,USDT_TRX,TRX`), `plisio_review_group`.
- **Toggle key**: `payment_method_plisio` (same pattern as card/crypto/gateway).
- **Emoji detection in coins.ts**: `/💫/.test(text)` → method = `"plisio"`.
- **Review group routing**: `plisio_review_group` key in `METHOD_GROUP_SETTING` map in coins.ts.
- **Package creation wizard**: step 7/8 = tetrapay_price → step 8/8 = plisio_price (added one extra step).
- **Package edit**: `pkg_edit_field` regex extended to include `plisio_price`; `-` clears the field (sets null).
- **Success/fail redirect security**: `success_callback_url`/`fail_callback_url` point at our own server landing page (`/webhook/plisio/return?r=ok|fail&order=<order_number>`), NOT directly at the bot deep link. That page forwards to `?start=plisio_r_<order_number>`; the bot then looks up that exact order, checks `tx.userId === tgId` (ownership), and only shows the *real* DB status (set solely by the signed webhook) — never trusts the URL's claimed outcome. This prevents anyone who finds/shares a generic success link from faking a paid-success screen.

**Why:**
Plisio is a global crypto payment gateway used alongside TetraPay (Iran-specific). They coexist; each has its own review group, toggle, and per-package price override.
