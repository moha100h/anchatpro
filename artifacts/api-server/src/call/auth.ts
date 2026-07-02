import crypto from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * Validates Telegram Mini App initData HMAC.
 * Returns the parsed user object if valid, null if invalid/missing.
 */
export function validateInitData(initData: string): TelegramUser | null {
  try {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token || !initData) return null;

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(token)
      .digest();

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (expectedHash !== hash) return null;

    const userStr = params.get("user");
    if (!userStr) return null;

    const user = JSON.parse(userStr) as TelegramUser;
    if (!user.id) return null;

    return user;
  } catch {
    return null;
  }
}
