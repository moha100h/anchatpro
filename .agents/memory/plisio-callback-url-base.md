---
name: Plisio success/fail redirect URL derivation
description: Derive returnBaseUrl from callbackUrl, not getBaseUrl(), to avoid localhost redirects on VPS
---

## The rule
In `createPlisioOrder()`, derive the base URL for `success_callback_url` / `fail_callback_url` from the admin-configured `plisio_callback_url` setting, NOT from `getBaseUrl()`.

## Why
`getBaseUrl()` returns:
1. `BASE_URL` env var (correct on VPS if set)
2. `REPLIT_DEV_DOMAIN` (correct in Replit)
3. `http://localhost:PORT` (WRONG on VPS if BASE_URL not set)

If admin set `plisio_callback_url = "https://bot.example.com/webhook/plisio"`, we can extract `"https://bot.example.com"` from it. This base is guaranteed to be the correct public URL since the admin already configured it for webhook delivery.

## How to apply
```typescript
const callbackUrl = rawCallbackUrl.split("?")[0]!.trim();
let derivedBaseUrl = callbackUrl.replace(/\/webhook\/plisio\/?$/, "").trim();
if (!derivedBaseUrl.startsWith("http")) {
  derivedBaseUrl = getBaseUrl(); // fallback only
}
params.set("success_callback_url", `${derivedBaseUrl}/webhook/plisio/return?r=ok&order=${orderNumber}`);
params.set("fail_callback_url",    `${derivedBaseUrl}/webhook/plisio/return?r=fail&order=${orderNumber}`);
```
