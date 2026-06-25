import { pgTable, serial, bigint, integer, text, timestamp, varchar, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentMethodEnum = pgEnum("payment_method", ["card", "crypto", "gateway"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "approved", "rejected"]);

export const paymentPackagesTable = pgTable("payment_packages", {
  id: serial("id").primaryKey(),
  coins: integer("coins").notNull(),
  price: integer("price").notNull(),
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

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
export type PaymentPackage = typeof paymentPackagesTable.$inferSelect;
