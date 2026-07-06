---
name: Plisio webhook body-parser conflict
description: express.json() overwrites req.body after raw body capture unless req._body=true is set
---

## The rule
After the Plisio raw-body capture middleware consumes the stream and sets `req.body`, set `(req as any)._body = true` to prevent `express.json()` and `express.urlencoded()` from running on that request.

## Why
`express.json()` is registered globally (not scoped). After our middleware drains the stream, body-parser tries to re-read from the exhausted stream. It gets 0 bytes. Depending on the `Content-Length` header:
- If Content-Length is 0 → body-parser sets `req.body = {}`, clobbering our parsed JSON.
- If Content-Length > 0 but stream is empty → body-parser may throw "request size did not match content length", calling `next(err)` and skipping the route handler entirely.

Setting `req._body = true` is the documented internal signal that body-parser checks **first** (`if (req._body) { debug('body already parsed'); next(); return; }`). With this flag set, all body-parser middlewares skip the request.

## How to apply
In `app.ts`, inside the `/webhook/plisio` raw-body middleware, add this line **before** calling `next()`:
```typescript
(req as any)._body = true;
```

Place it immediately after `req.rawBody = raw;`, before the JSON.parse block.
