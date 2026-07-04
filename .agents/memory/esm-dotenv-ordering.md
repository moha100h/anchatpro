---
name: ESM static import hoisting vs dotenv
description: static imports evaluate before top-level code in the same file, even code written above them
---
In ES modules, static `import ... from "./x.js"` statements are hoisted and their target modules are FULLY evaluated before ANY of the importing file's own top-level statements run — regardless of the textual order in the source. Writing `dotenv.config()` "above" a static import does NOT guarantee it runs before that imported module's top-level code.

**Why:** An app's `lib/db` package created a `pg.Pool` using `process.env.DATABASE_URL` at module top-level. Adding `dotenv.config()` before `import app from "./app.js"` in the entrypoint still left `DATABASE_URL` unset when the Pool was constructed, because `app.js` (and its transitive import of the db package) evaluated first.

**How to apply:** When an entrypoint needs to guarantee `dotenv.config()` (or any env-setup code) runs before modules that read env vars at load time, load those modules via dynamic `import()` (with top-level await) placed AFTER the env setup, instead of static imports. This defers their evaluation to that exact point in execution.
