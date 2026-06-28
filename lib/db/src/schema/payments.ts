import { pgTable, serial, bigint, integer, text, timestamp, varchar, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentMethodEnum = pgEnum("payment_method", ["card", "crypto", "gateway"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "approved", "rejected"]);
export const tetraPayStatusEnum = pgEnum("tetrapay_status", ["pending", "paid", "failed", "duplicate"]);

export const paymentPackagesTable = pgTable("payment_packages", {
  id: serial("id").primaryKey(),
  coins: integer("coins").notNull(),
  price: integer("price").notNull(),
  originalPrice: integer("original_price"),
  discountPercent: integer("discount_percent").default(0).notNull(),
  currency: varchar("currency", { length: 10 }).default("IRT").notNull(),
  label: varchar("label", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  packageId: integer("package_id"),
  coins: integer("coins").notNull(),
  price: integer("price").notNull(),
  currency: varchar("currency", { length: 10 }).default("IRT").notNull(),
  method: paymentMethodEnum("method").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  receiptFileId: varchar("receipt_file_id", { length: 512 }),
  adminMessageId: integer("admin_message_id"),
  adminGroupId: bigint("admin_group_id", { mode: "number" }),
  rejectionReason: text("rejection_reason"),
  processedBy: bigint("processed_by", { mode: "number" }),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** TetraPay gateway transactions (one-to-one with paymentsTable when method=gateway) */
export const tetraPayTransactionsTable = pgTable("tetrapay_transactions", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull(),          // FK to paymentsTable.id
  userId: bigint("user_id", { mode: "number" }).notNull(),
  hashId: varchar("hash_id", { length: 128 }).notNull().unique(),  // our unique invoice id
  authority: varchar("authority", { length: 256 }),    // from TetraPay response
  trackingId: varchar("tracking_id", { length: 128 }),
  paymentUrlBot: varchar("payment_url_bot", { length: 512 }),
  paymentUrlWeb: varchar("payment_url_web", { length: 512 }),
  amountRial: integer("amount_rial").notNull(),
  status: tetraPayStatusEnum("status").default("pending").notNull(),
  callbackVerified: boolean("callback_verified").default(false).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  verifiedAt: timestamp("verified_at"),
});

export const discountCodesTable = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  discountPercent: integer("discount_percent").notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0).notNull(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
export type PaymentPackage = typeof paymentPackagesTable.$inferSelect;
export type TetraPayTransaction = typeof tetraPayTransactionsTable.$inferSelect;
export type DiscountCode = typeof discountCodesTable.$inferSelect;
