import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, bigint, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "CARD", "BANK_ACH", "PAYPAL", "VENMO", "ZELLE", "CRYPTO"
]);

export const transactionTypeEnum = pgEnum("transaction_type", ["CREDIT", "DEBIT"]);

export const transactionStatusEnum = pgEnum("transaction_status", ["PENDING", "COMPLETED", "FAILED"]);

export const auditEventTypeEnum = pgEnum("audit_event_type", [
  "AUTH_LOGIN", "AUTH_LOGOUT", "AUTH_REGISTER", "AUTH_PASSWORD_CHANGE", "AUTH_2FA_ENABLE", "AUTH_2FA_DISABLE",
  "WALLET_FUND", "WALLET_DEBIT", "WALLET_AUTO_TOPUP",
  "PAYMENT_METHOD_ADD", "PAYMENT_METHOD_REMOVE", "PAYMENT_METHOD_SET_DEFAULT",
  "API_KEY_CREATE", "API_KEY_REVOKE",
  "APP_SUBSCRIBE", "APP_UNSUBSCRIBE",
  "ADMIN_ACTION"
]);

export const webhookEventTypeEnum = pgEnum("webhook_event_type", [
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "PAYMENT_PENDING",
  "PAYMENT_REFUNDED",
  "PAYMENT_METHOD_ATTACHED",
  "PAYMENT_METHOD_DETACHED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_CANCELLED",
  "AUTO_TOPUP_TRIGGERED",
  "AUTO_TOPUP_FAILED"
]);

export const webhookEventStatusEnum = pgEnum("webhook_event_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "RETRYING"
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  eventType: auditEventTypeEnum("event_type").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventType: webhookEventTypeEnum("event_type").notNull(),
  status: webhookEventStatusEnum("status").default("PENDING").notNull(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  payload: text("payload"),
  processingResult: text("processing_result"),
  attempts: bigint("attempts", { mode: "number" }).default(0).notNull(),
  maxAttempts: bigint("max_attempts", { mode: "number" }).default(3).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const twoFactorMethodEnum = pgEnum("two_factor_method", ["TOTP", "SMS"]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  phoneVerified: boolean("phone_verified").default(false).notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorMethod: twoFactorMethodEnum("two_factor_method").default("TOTP"),
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

export const billingCycleEnum = pgEnum("billing_cycle", ["MONTHLY", "YEARLY", "PER_USE"]);

export const apps = pgTable("apps", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  callbackUrl: text("callback_url").notNull(),
  allowedCallbackUrls: text("allowed_callback_urls").array().default([]),
  pricingModel: text("pricing_model").notNull(),
  billingCycle: billingCycleEnum("billing_cycle").default("MONTHLY"),
  monthlyPriceCents: bigint("monthly_price_cents", { mode: "number" }).default(0),
  yearlyPriceCents: bigint("yearly_price_cents", { mode: "number" }).default(0),
  perUsePriceCents: bigint("per_use_price_cents", { mode: "number" }).default(0),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret").notNull(),
  iconUrl: text("icon_url"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subscriptionStatusEnum = pgEnum("subscription_status", ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED", "PENDING"]);

export const appSubscriptions = pgTable("app_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 36 }).notNull().references(() => apps.id, { onDelete: "cascade" }),
  billingCycle: billingCycleEnum("billing_cycle").default("MONTHLY"),
  status: subscriptionStatusEnum("status").default("ACTIVE").notNull(),
  currentPeriodStart: timestamp("current_period_start").defaultNow().notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
  nextBillingDate: timestamp("next_billing_date"),
  lastBilledAt: timestamp("last_billed_at"),
  totalUsageCount: bigint("total_usage_count", { mode: "number" }).default(0),
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

export const appApiKeys = pgTable("app_api_keys", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id", { length: 36 }).notNull().references(() => apps.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").array().default([]).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const smsOtpCodes = pgTable("sms_otp_codes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  purpose: text("purpose").notNull(),
  attempts: bigint("attempts", { mode: "number" }).default(0).notNull(),
  maxAttempts: bigint("max_attempts", { mode: "number" }).default(3).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 36 }).notNull().references(() => apps.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  scope: text("scope"),
  state: text("state"),
  authorizeTraceId: text("authorize_trace_id"),
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const oauthAccessTokens = pgTable("oauth_access_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull().unique(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 36 }).notNull().references(() => apps.id, { onDelete: "cascade" }),
  scope: text("scope"),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const oauthAuditLogs = pgTable("oauth_audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  traceId: text("trace_id").notNull(),
  event: text("event").notNull(),
  clientId: text("client_id"),
  appName: text("app_name"),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  userEmail: text("user_email"),
  redirectUri: text("redirect_uri"),
  scope: text("scope"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  durationMs: bigint("duration_ms", { mode: "number" }),
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
  apiKeys: many(appApiKeys),
}));

export const appSubscriptionsRelations = relations(appSubscriptions, ({ one }) => ({
  user: one(users, { fields: [appSubscriptions.userId], references: [users.id] }),
  app: one(apps, { fields: [appSubscriptions.appId], references: [apps.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

export const appApiKeysRelations = relations(appApiKeys, ({ one }) => ({
  app: one(apps, { fields: [appApiKeys.appId], references: [apps.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const smsOtpCodesRelations = relations(smsOtpCodes, ({ one }) => ({
  user: one(users, { fields: [smsOtpCodes.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  user: one(users, { fields: [webhookEvents.userId], references: [users.id] }),
}));

export const oauthAuthorizationCodesRelations = relations(oauthAuthorizationCodes, ({ one }) => ({
  user: one(users, { fields: [oauthAuthorizationCodes.userId], references: [users.id] }),
  app: one(apps, { fields: [oauthAuthorizationCodes.appId], references: [apps.id] }),
}));

export const oauthAccessTokensRelations = relations(oauthAccessTokens, ({ one }) => ({
  user: one(users, { fields: [oauthAccessTokens.userId], references: [users.id] }),
  app: one(apps, { fields: [oauthAccessTokens.appId], references: [apps.id] }),
}));

export const oauthAuditLogsRelations = relations(oauthAuditLogs, ({ one }) => ({
  user: one(users, { fields: [oauthAuditLogs.userId], references: [users.id] }),
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
  smsCode: z.string().optional(),
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
  lastBilledAt: true,
  currentPeriodStart: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  keyHash: true,
  keyPrefix: true,
  lastUsedAt: true,
});

export const insertAppApiKeySchema = createInsertSchema(appApiKeys).omit({
  id: true,
  createdAt: true,
  keyHash: true,
  keyPrefix: true,
  lastUsedAt: true,
  revokedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

export const insertSmsOtpCodeSchema = createInsertSchema(smsOtpCodes).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});

export const insertOauthAuthorizationCodeSchema = createInsertSchema(oauthAuthorizationCodes).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});

export const insertOauthAccessTokenSchema = createInsertSchema(oauthAccessTokens).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});

export const insertOauthAuditLogSchema = createInsertSchema(oauthAuditLogs).omit({
  id: true,
  createdAt: true,
});

export const paymentGatewayEnum = pgEnum("payment_gateway", [
  "STRIPE", "PAYPAL", "COINBASE"
]);

export const paymentGatewaySettings = pgTable("payment_gateway_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  gateway: paymentGatewayEnum("gateway").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  sandboxMode: boolean("sandbox_mode").default(true).notNull(),
  displayName: text("display_name").notNull(),
  displayOrder: bigint("display_order", { mode: "number" }).default(0).notNull(),
  supportedMethods: text("supported_methods").array().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPaymentGatewaySettingsSchema = createInsertSchema(paymentGatewaySettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type AppApiKey = typeof appApiKeys.$inferSelect;
export type InsertAppApiKey = z.infer<typeof insertAppApiKeySchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type SmsOtpCode = typeof smsOtpCodes.$inferSelect;
export type InsertSmsOtpCode = z.infer<typeof insertSmsOtpCodeSchema>;
export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type InsertOauthAuthorizationCode = z.infer<typeof insertOauthAuthorizationCodeSchema>;
export type OauthAccessToken = typeof oauthAccessTokens.$inferSelect;
export type InsertOauthAccessToken = z.infer<typeof insertOauthAccessTokenSchema>;
export type OauthAuditLog = typeof oauthAuditLogs.$inferSelect;
export type InsertOauthAuditLog = z.infer<typeof insertOauthAuditLogSchema>;
export type PaymentGatewaySettings = typeof paymentGatewaySettings.$inferSelect;
export type InsertPaymentGatewaySettings = z.infer<typeof insertPaymentGatewaySettingsSchema>;
