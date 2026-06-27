---
name: Grammy botInfo lazy access
description: bot.botInfo must not be accessed at handler-registration time; it is only set after bot.init().
---

## Rule
Never write `const BOT_USERNAME = bot.botInfo?.username` at the top of a `registerXxxHandlers(bot)` function. That code runs at bot-creation time, before `bot.init()`, so Grammy throws "Bot information unavailable!".

## Correct pattern
Define a lazy getter inside the registration function, then call it inside each handler callback:

```ts
export function registerMyHandlers(bot: Bot<BotContext>) {
  const getBotUsername = () => bot.botInfo?.username ?? "anymschat_bot";

  bot.hears(/.../, async (ctx) => {
    const link = `https://t.me/${getBotUsername()}?start=...`;
    // ...
  });
}
```

**Why:** Grammy only populates `botInfo` after the async `bot.init()` call resolves. Registration functions are called synchronously during `createBot()`, which runs before `bot.init()`.

**How to apply:** Any time you need the bot's username inside a handler file, wrap the access in an arrow function and call it inside the async handler body.
