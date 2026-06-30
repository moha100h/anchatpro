import { Context, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";
import type { User } from "@workspace/db";

export interface SessionData {
  step?: string;
  pendingPaymentPackageId?: number;
  pendingPaymentMethod?: string;
  pendingReportSessionId?: number;
  pendingBlockUserId?: number;
  pendingAnonMsgId?: number;
  adminAction?: string;
  adminTargetUserId?: number;
  broadcastStep?: string;
  // 🌊 Magic features
  magicStep?: string;
  magicChainId?: number;
  // 🎯 Same-age matching toggle
  sameAgeMatch?: boolean;
  // 🎟️ Gift code input
  giftCodeInput?: boolean;
  // 💰 Coin purchase discount
  pendingDiscountCodeId?: number;
  pendingDiscountPercent?: number;
  // 📦 Admin package creation temp
  adminPkgStep?: string;
  adminPkgCoins?: number;
  adminPkgPrice?: number;
  adminPkgLabel?: string;
  adminPkgCardPrice?: number;
  adminPkgCryptoPrice?: number;
  adminPkgTetrapayPrice?: number;
  adminPkgPlisioPrice?: number;
  adminPkgDiscount?: number;
  adminPkgEditId?: number;
  // 💱 Admin crypto currency creation temp
  adminCryptoStep?: string;
  adminCryptoSymbol?: string;
  adminCryptoName?: string;
  adminCryptoAddress?: string;
  adminCryptoNetwork?: string;
  adminCryptoCoinGeckoId?: string;
  // 🏷️ Admin discount code creation temp
  adminDcStep?: string;
  adminDcCode?: string;
  adminDcPercent?: number;
  adminDcMaxUses?: number;
  // 🎁 Admin gift code creation temp
  adminGiftCoins?: number;
  // 🛡️ Admin panel navigation mode
  adminMode?: "main" | "system" | "payment" | "costs";
  // 📣 Broadcast filter state
  broadcastGender?: "male" | "female" | "any";
  broadcastAgeRange?: string;   // e.g. "15-25", "25-35", "any"
  broadcastCountLimit?: number; // 0 = unlimited
  broadcastTarget?: "all" | "active";
}

export type BotContext = ConversationFlavor<Context & SessionFlavor<SessionData>> & {
  dbUser?: User | null;
};
