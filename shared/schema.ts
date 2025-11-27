import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, bigint, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "CARD", "BANK_ACH", "PAYPAL", "VENMO", "ZELLE", "CRYPTO"
]);

export const transactionTypeEnum = pgEnum("transaction_type", ["CREDIT", "DEBIT"]);

export const transactionStatusEnum = pgEnum("transaction_status", ["PENDING", "COMPLETED", "FAILED"]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecret: text("two_factor_secret"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const wallets = pgTable("wallets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  currency: text("currency").default("USD").notNull(),
  balanceCents: bigint("balance_cents", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  type: paymentMethodTypeEnum("type").notNull(),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  last4: text("last4"),
  brand: text("brand"),
  nickname: text("nickname"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  walletId: varchar("wallet_id", { length: 36 }).notNull().references(() => wallets.id, { onDelete: "cascade" }),
  type: transactionTypeEnum("type").notNull(),
  source: text("source").notNull(),
  appId: varchar("app_id", { length: 36 }).references(() => apps.id),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  description: text("description").notNull(),
  status: transactionStatusEnum("status").default("PENDING").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const autoTopupRules = pgTable("auto_topup_rules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  walletId: varchar("wallet_id", { length: 36 }).notNull().references(() => wallets.id, { onDelete: "cascade" }),
  paymentMethodId: varchar("payment_method_id", { length: 36 }).notNull().references(() => paymentMethods.id, { onDelete: "cascade" }),
  thresholdCents: bigint("threshold_cents", { mode: "number" }).notNull(),
  topupAmountCents: bigint("topup_amount_cents", { mode: "number" }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apps = pgTable("apps", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  callbackUrl: text("callback_url").notNull(),
  pricingModel: text("pricing_model").notNull(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret").notNull(),
  iconUrl: text("icon_url"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appSubscriptions = pgTable("app_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 36 }).notNull().references(() => apps.id, { onDelete: "cascade" }),
  status: text("status").default("active").notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at"),
});

export const apiKeys = pgTable("api_keys", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, { fields: [users.id], references: [wallets.userId] }),
  paymentMethods: many(paymentMethods),
  autoTopupRules: many(autoTopupRules),
  appSubscriptions: many(appSubscriptions),
  apiKeys: many(apiKeys),
  refreshTokens: many(refreshTokens),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  transactions: many(walletTransactions),
  autoTopupRules: many(autoTopupRules),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ one, many }) => ({
  user: one(users, { fields: [paymentMethods.userId], references: [users.id] }),
  autoTopupRules: many(autoTopupRules),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(wallets, { fields: [walletTransactions.walletId], references: [wallets.id] }),
  app: one(apps, { fields: [walletTransactions.appId], references: [apps.id] }),
}));

export const autoTopupRulesRelations = relations(autoTopupRules, ({ one }) => ({
  user: one(users, { fields: [autoTopupRules.userId], references: [users.id] }),
  wallet: one(wallets, { fields: [autoTopupRules.walletId], references: [wallets.id] }),
  paymentMethod: one(paymentMethods, { fields: [autoTopupRules.paymentMethodId], references: [paymentMethods.id] }),
}));

export const appsRelations = relations(apps, ({ many }) => ({
  subscriptions: many(appSubscriptions),
  transactions: many(walletTransactions),
}));

export const appSubscriptionsRelations = relations(appSubscriptions, ({ one }) => ({
  user: one(users, { fields: [appSubscriptions.userId], references: [users.id] }),
  app: one(apps, { fields: [appSubscriptions.appId], references: [apps.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email("Invalid email address"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  totpCode: z.string().optional(),
});

export const insertWalletSchema = createInsertSchema(wallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertAutoTopupRuleSchema = createInsertSchema(autoTopupRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppSchema = createInsertSchema(apps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  clientId: true,
  clientSecret: true,
});

export const insertAppSubscriptionSchema = createInsertSchema(appSubscriptions).omit({
  id: true,
  subscribedAt: true,
  cancelledAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  keyHash: true,
  keyPrefix: true,
  lastUsedAt: true,
});

export const fundWalletSchema = z.object({
  amountCents: z.number().min(100, "Minimum amount is $1.00"),
  paymentMethodId: z.string().uuid(),
});

export const autoTopupConfigSchema = z.object({
  thresholdCents: z.number().min(0),
  topupAmountCents: z.number().min(100),
  paymentMethodId: z.string().uuid(),
  active: z.boolean(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type AutoTopupRule = typeof autoTopupRules.$inferSelect;
export type InsertAutoTopupRule = z.infer<typeof insertAutoTopupRuleSchema>;
export type App = typeof apps.$inferSelect;
export type InsertApp = z.infer<typeof insertAppSchema>;
export type AppSubscription = typeof appSubscriptions.$inferSelect;
export type InsertAppSubscription = z.infer<typeof insertAppSubscriptionSchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;
