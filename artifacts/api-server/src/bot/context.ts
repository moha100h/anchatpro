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
  // 🎁 Admin gift code creation temp
  adminGiftCoins?: number;
}

export type BotContext = ConversationFlavor<Context & SessionFlavor<SessionData>> & {
  dbUser?: User | null;
};
