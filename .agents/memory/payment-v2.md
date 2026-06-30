---
name: Payment system v2
description: Per-gateway scoped packages, discount codes, multi-currency crypto, card display, gateway display names, package admin CRUD
---

## Gateway-scoped packages (v3 architecture)
`paymentPackagesTable` now has a `gateway` column (card|crypto|tetrapay|plisio|null) and `description` column.
- Gateway-scoped packages (gateway != null): `price` is the only price; currency auto-set by gateway (USD for crypto/plisio, IRT for card/tetrapay).
- Legacy packages (gateway = null): optional `cardPrice`, `cryptoPrice`, `tetrapayPrice` overrides; base `price` is fallback.
- `getPackages(method?)` in payment.service: if gateway-scoped packages exist for a gateway, returns those; otherwise falls back to legacy (gateway=null) packages.
- `methodToGateway(method)` maps 'gateway'→'tetrapay', others pass through.

## Gateway display names
Stored in `admin_settings` as `gateway_display_name_card`, `_crypto`, `_tetrapay`, `_plisio`.
- Admin: each gateway panel has "📝 نام نمایشی" button → `gw_name:{gw}` callback → `set_gw_name:{gw}` text action → saved via setSetting.
- User side: `coinsGatewayKeyboard(lang, enabled, customNames?)` — fetched at display time in coins.ts; pass as `gwNames` object.
- Default fallback (no setting): 💳 پرداخت کارت‌به‌کارت / ₿ ارز دیجیتال (کریپتو) / 🌐 درگاه آنلاین (TetraPay) / 💫 پلیزیو (Plisio).
- Gateway detection in step 1 handler: fetch names from settings, compare text exactly against stored or default names (not emoji-only matching).

## Per-gateway package admin CRUD
Each gateway panel has "📦 بسته‌ها" → lists packages scoped to that gateway.
- Create: `gw_pkg:create:{gw}` callback → 5-step text wizard: `gpkg_coins` → `gpkg_price` → `gpkg_discount` → `gpkg_label` → `gpkg_desc` → calls `createPackage({gateway, coins, price, ...})`.
- Edit: `gw_pkg:edit:{id}` callback → field buttons → `gpkgedit:{id}:{field}` text action. Fields: coins, price, discount, label, description.
- Toggle: `gw_pkg:toggle:{id}` — soft enable/disable.
- Delete: `gw_pkg:del:{id}` — hard delete (deletePackage).

## Package keyboard (coinsPackagesKeyboard)
Gateway-scoped: shows `pkg.price` directly, detects USD vs IRT from pkg.gateway.
Legacy: resolves per-gateway override (cardPrice, cryptoPrice, etc.).
Price format: `$N` for USD gateways, `N,NNN تومان` for IRT gateways.
Button: `💎 {label} | {priceStr}` or `💎 {label} | {priceStr} 🔥-{discount}%`.

## Legacy package create flow (7 steps, admin panel global)
`admin_pkg:create` → text chain: `admin_pkg_create_coins` → `…price` → `…discount` → `…label` → `…card_price` → `…crypto_price` → `…tetrapay_price` → `createPackage()`.

## Package edit menu (legacy)
`admin_pkg:edit:ID` → 7 buttons: coins, price, discount, label, card_price, crypto_price, tetrapay_price.
Text action: `pkg_edit:{id}:{field}`.

## Discount codes
`discountCodesTable`: code, discountPercent, maxUses, usedCount, expiresAt, isActive.
- `validateDiscountCode(code)` → `{ valid, discountPercent, codeId }`.
- Admin CRUD via `admin_dc:create` / `admin_dc:toggle:ID:on|off` callbacks.

## Multi-currency crypto
Stored as JSON in `admin_settings` key `crypto_currencies`.
Each entry: `{ symbol, name, address, network, coinGeckoId? }`.
`fetchCryptoPriceWithFallback(coinGeckoId)` → IRT price; fallback: `usd_to_irt` × USD.

## Gateway-first purchase flow (coins.ts)
1. "🛒 خرید سکه" → fetch gateway display names → `coinsGatewayKeyboard(lang, enabled, gwNames)` (step `buying:gateway`).
2. User taps gateway name → text matched against stored/default display names → `pendingPaymentMethod` set → `getPackages(method)` → `coinsPackagesKeyboard(packages, lang, method)` (step `buying:package`).
3. Back in `buying:package` → returns to step 1.
4. Package selected → inline discount keyboard → `handlePaymentByMethod()`.

## Per-gateway review groups
`card_review_group`, `crypto_review_group`, `tetrapay_review_group`, `plisio_review_group` in admin_settings.
Fallback: `payment_review_group`.

## Card display
Settings: `card_number`, `card_holder_name`, `card_bank_name`. Shows bank + holder + card number + amount.

**Why:** Per-gateway scoped packages let admins configure separate package lists per gateway (crypto might have different denominations than card) without overlapping price fields. Display names allow branding customization without code changes.

**How to apply:** When fetching packages for display, always pass `method` to `getPackages(method)`. When building gateway keyboard, fetch display names from settings and pass as `customNames`. `methodToGateway()` is the canonical method→gateway mapping.
