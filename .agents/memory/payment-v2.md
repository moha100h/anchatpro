---
name: Payment system v2
description: Per-gateway package prices, discount codes, multi-currency crypto, card display, package admin CRUD
---

## Package per-gateway prices
`paymentPackagesTable` has `cardPrice`, `cryptoPrice`, `tetrapayPrice` (all nullable).
- `null` → use base `price`
- Admin panel now exposes all three via package edit (7-field menu) and package create (7-step flow)
- `createPackage()` and `updatePackage()` in `payment.service.ts` accept all three fields
- Session context has `adminPkgLabel`, `adminPkgCardPrice`, `adminPkgCryptoPrice`, `adminPkgTetrapayPrice`
- Package list in admin shows per-gateway prices inline: `[💳X | ₿$Y | 🌐Z]` when set

## Package create flow (7 steps)
`admin_pkg:create` callback → text handler chain:
1. `admin_pkg_create_coins`
2. `admin_pkg_create_price`
3. `admin_pkg_create_discount`
4. `admin_pkg_create_label` → stores label in `adminPkgLabel` session
5. `admin_pkg_create_card_price` (or `-` to skip)
6. `admin_pkg_create_crypto_price` (or `-` to skip)
7. `admin_pkg_create_tetrapay_price` (or `-` to skip) → calls `createPackage()`

## Package edit menu
`admin_pkg:edit:ID` callback shows 7 buttons:
- coins, price, discount, label (basic)
- card_price, crypto_price, tetrapay_price (per-gateway — enter `-` to clear to null)
Regex: `/^pkg_edit_field:(\d+):(coins|price|discount|label|card_price|crypto_price|tetrapay_price)$/`

## Discount codes
`discountCodesTable`: code, discountPercent, maxUses, usedCount, expiresAt, isActive
- `validateDiscountCode(code)` → `{ valid, discountPercent, codeId }`
- `useDiscountCode(codeId)` → increments usedCount
- Admin CRUD via `ADMIN_BTN.DISCOUNT_CODES` hears handler + `admin_dc:create` / `admin_dc:toggle:ID:on|off` callbacks

## Multi-currency crypto
Stored as JSON in `admin_settings` under key `crypto_currencies`.
`getCryptoCurrencies()` / `saveCryptoCurrencies()` in `payment.service.ts`.
Each entry: `{ symbol, name, address, network, coinGeckoId? }`.
`fetchCryptoPriceWithFallback(coinGeckoId)` → IRT price (Toman) from CoinGecko free API;
fallback uses `usd_to_irt` setting × USD price.
If only 1 currency configured, skip selection keyboard.

## Gateway-first purchase flow (coins.ts)
1. "🛒 خرید سکه" → `coinsGatewayKeyboard` (step `buying:gateway`)
2. User taps 💳/₿/🌐 → `pendingPaymentMethod` set, `coinsPackagesKeyboard(packages, lang, method)` shown (step `buying:package`)
3. Back in `buying:package` → return to step 1
4. Package selected → inline discount keyboard (`discount:enter` / `discount:skip`)
5. `discount:skip` or code validated → `handlePaymentByMethod()` helper

## Per-gateway review groups
- `card_review_group`, `crypto_review_group`, `tetrapay_review_group` in `admin_settings`
- Fallback: `payment_review_group`
- Receipt → photo sent to correct group based on `pendingPayment.method`

## Card display
Shows: 🏦 bank name + 👤 holder name + 💳 card number (code) + 💰 amount (with discount %)
Settings: `card_number`, `card_holder_name`, `card_bank_name`

**Why:** Per-gateway prices allow different pricing for card vs crypto vs TetraPay without separate packages. The 7-step create flow avoids needing a separate "edit prices" step after creation.

**How to apply:** When admin creates or edits a package, all three gateway overrides are optional (send `-` to use base price). The `coins.ts` handler and `coinsPackagesKeyboard` already read these gateway prices to show the correct price per method.
