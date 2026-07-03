---
  name: Plisio webhook verify bug
  description: Root cause for coins not being credited after successful Plisio payments — wrong HMAC serialization method.
  ---

  ## The bug
  `verifyPlisioHash()` built the string-to-sign using PHP `serialize()` semantics with sorted keys, then HMAC-SHA1'd it. Plisio's actual callback (sent with `?json=true` on the callback URL) signs the payload with `HMAC-SHA1(JSON.stringify(payload minus verify_hash))` — no key sorting, no PHP serialize, no special casting of `expire_utc`.

  Because the algorithm never matched, `verifyPlisioHash` always returned false, `handlePlisioCallback` always short-circuited on "Invalid signature", and coins were **never credited** even though payments completed successfully on Plisio's side. This was silent — the webhook still returned HTTP 200 (correct, to stop Plisio retries) so nothing looked broken from Plisio's dashboard.

  **Why:** Plisio's docs describe two signing modes depending on whether the callback is form-encoded or JSON; this project always requests JSON callbacks, so only the JSON-based signing rule applies. Never assume PHP-originated docs/examples apply as-is to a JSON callback integration — verify against the exact callback content-type actually configured.

  **How to apply:** If verifying any Plisio (or similarly PHP-SDK-documented) webhook signature, confirm which callback format you configured (`?json=true` vs form) before picking a signing algorithm. When debugging "payment succeeded but action X never happened," check signature verification first — silent `return false` there is a classic root cause and won't show up in normal error logs unless you add explicit warnings.
  