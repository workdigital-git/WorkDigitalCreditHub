import {
  users,
  wallets,
  paymentMethods,
  walletTransactions,
  autoTopupRules,
  apps,
  appSubscriptions,
  apiKeys,
  appApiKeys,
  refreshTokens,
  auditLogs,
  webhookEvents,
  webhookDeliveries,
  integrationHealthMetrics,
  smsOtpCodes,
  passwordResetTokens,
  oauthAuthorizationCodes,
  oauthAccessTokens,
  oauthAuditLogs,
  paymentGatewaySettings,
  oauthIdentities,
  referrals,
  referralSettings,
  stripeCustomers,
  stripeEvents,
  creditPacks,
  walletLedger,
  autopaySettings,
  autopayAttempts,
  checkoutSessions,
  type User,
  type InsertUser,
  type Wallet,
  type InsertWallet,
  type PaymentMethod,
  type InsertPaymentMethod,
  type WalletTransaction,
  type InsertWalletTransaction,
  type AutoTopupRule,
  type InsertAutoTopupRule,
  type App,
  type InsertApp,
  type AppSubscription,
  type InsertAppSubscription,
  type ApiKey,
  type InsertApiKey,
  type AppApiKey,
  type InsertAppApiKey,
  type RefreshToken,
  type AuditLog,
  type InsertAuditLog,
  type WebhookEvent,
  type InsertWebhookEvent,
  type WebhookDelivery,
  type InsertWebhookDelivery,
  type IntegrationHealthMetrics,
  type InsertIntegrationHealthMetrics,
  type SmsOtpCode,
  type InsertSmsOtpCode,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type OauthAuthorizationCode,
  type InsertOauthAuthorizationCode,
  type OauthAccessToken,
  type InsertOauthAccessToken,
  type OauthAuditLog,
  type InsertOauthAuditLog,
  type PaymentGatewaySettings,
  type InsertPaymentGatewaySettings,
  merchantSettings,
  type MerchantSettings,
  type InsertMerchantSettings,
  type OAuthIdentity,
  type InsertOAuthIdentity,
  type Referral,
  type InsertReferral,
  type ReferralSettings,
  type InsertReferralSettings,
  type StripeCustomer,
  type InsertStripeCustomer,
  type StripeEvent,
  type InsertStripeEvent,
  type CreditPack,
  type InsertCreditPack,
  type WalletLedger,
  type InsertWalletLedger,
  type AutopaySettings,
  type InsertAutopaySettings,
  type AutopayAttempt,
  type InsertAutopayAttempt,
  type CheckoutSession,
  type InsertCheckoutSession,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  getWallet(id: string): Promise<Wallet | undefined>;
  getWalletByUserId(userId: string): Promise<Wallet | undefined>;
  createWallet(wallet: Omit<Wallet, "id" | "createdAt" | "updatedAt">): Promise<Wallet>;
  updateWalletBalance(id: string, amountCents: number): Promise<Wallet | undefined>;

  getPaymentMethod(id: string): Promise<PaymentMethod | undefined>;
  getPaymentMethodsByUserId(userId: string): Promise<PaymentMethod[]>;
  createPaymentMethod(method: Omit<PaymentMethod, "id" | "createdAt" | "updatedAt">): Promise<PaymentMethod>;
  updatePaymentMethod(id: string, data: Partial<PaymentMethod>): Promise<PaymentMethod | undefined>;
  deletePaymentMethod(id: string): Promise<boolean>;
  setDefaultPaymentMethod(userId: string, methodId: string): Promise<void>;

  getTransactionsByWalletId(walletId: string, limit?: number): Promise<WalletTransaction[]>;
  createTransaction(transaction: Omit<WalletTransaction, "id" | "createdAt">): Promise<WalletTransaction>;
  updateTransactionStatus(id: string, status: "PENDING" | "COMPLETED" | "FAILED"): Promise<void>;
  updateTransactionExternalRef(id: string, externalRef: string, gateway: string): Promise<void>;

  getAutoTopupRule(id: string): Promise<AutoTopupRule | undefined>;
  getAutoTopupRuleByUserId(userId: string): Promise<AutoTopupRule | undefined>;
  createAutoTopupRule(rule: Omit<AutoTopupRule, "id" | "createdAt" | "updatedAt">): Promise<AutoTopupRule>;
  updateAutoTopupRule(id: string, data: Partial<AutoTopupRule>): Promise<AutoTopupRule | undefined>;
  getActiveAutoTopupRulesWithLowBalance(): Promise<(AutoTopupRule & { wallet: Wallet; paymentMethod: PaymentMethod })[]>;

  getApp(id: string): Promise<App | undefined>;
  getAppBySlug(slug: string): Promise<App | undefined>;
  getAppByClientId(clientId: string): Promise<App | undefined>;
  getAllApps(): Promise<App[]>;
  createApp(app: Omit<App, "id" | "createdAt" | "updatedAt">): Promise<App>;
  updateApp(id: string, data: Partial<App>): Promise<App | undefined>;

  getAppSubscription(userId: string, appId: string): Promise<AppSubscription | undefined>;
  getAppSubscriptionById(id: string): Promise<AppSubscription | undefined>;
  getAppSubscriptionsByUserId(userId: string): Promise<(AppSubscription & { app: App })[]>;
  createAppSubscription(subscription: Omit<AppSubscription, "id" | "subscribedAt" | "currentPeriodStart">): Promise<AppSubscription>;
  cancelAppSubscription(userId: string, appId: string): Promise<void>;
  updateAppSubscription(id: string, data: Partial<AppSubscription>): Promise<AppSubscription | undefined>;
  getSubscriptionsDueToBill(): Promise<(AppSubscription & { app: App; user: User })[]>;
  incrementSubscriptionUsage(subscriptionId: string): Promise<void>;

  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeysByUserId(userId: string): Promise<ApiKey[]>;
  getApiKeyByHash(hash: string): Promise<ApiKey | undefined>;
  createApiKey(key: Omit<ApiKey, "id" | "createdAt">): Promise<ApiKey>;
  deleteApiKey(id: string): Promise<boolean>;
  updateApiKeyLastUsed(id: string): Promise<void>;

  getAppApiKey(id: string): Promise<AppApiKey | undefined>;
  getAppApiKeysByAppId(appId: string): Promise<AppApiKey[]>;
  getAppApiKeyByHash(hash: string): Promise<(AppApiKey & { app: App }) | undefined>;
  getAllAppApiKeys(): Promise<(AppApiKey & { app: App })[]>;
  createAppApiKey(key: Omit<AppApiKey, "id" | "createdAt" | "lastUsedAt" | "revokedAt">): Promise<AppApiKey>;
  revokeAppApiKey(id: string): Promise<boolean>;
  deleteAppApiKey(id: string): Promise<boolean>;
  updateAppApiKeyLastUsed(id: string): Promise<void>;

  createRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<RefreshToken>;
  getRefreshTokenByHash(hash: string): Promise<RefreshToken | undefined>;
  deleteRefreshToken(id: string): Promise<void>;
  deleteRefreshTokensByUserId(userId: string): Promise<void>;

  getAdminStats(): Promise<{
    totalUsers: number;
    totalApps: number;
    totalBalance: number;
    totalTransactions: number;
  }>;

  createAuditLog(log: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog>;
  getAuditLogsByUserId(userId: string, limit?: number): Promise<AuditLog[]>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;

  createWebhookEvent(event: Omit<WebhookEvent, "id" | "createdAt" | "processedAt">): Promise<WebhookEvent>;
  getWebhookEvent(id: string): Promise<WebhookEvent | undefined>;
  getPendingWebhookEvents(limit?: number): Promise<WebhookEvent[]>;
  updateWebhookEventStatus(id: string, status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYING", result?: string): Promise<WebhookEvent | undefined>;
  getWebhookEvents(limit?: number): Promise<WebhookEvent[]>;

  createSmsOtp(otp: Omit<SmsOtpCode, "id" | "createdAt" | "usedAt">): Promise<SmsOtpCode>;
  getValidSmsOtp(phone: string, purpose: string): Promise<SmsOtpCode | undefined>;
  getRecentSmsOtp(phone: string, withinMinutes: number): Promise<SmsOtpCode | undefined>;
  incrementSmsOtpAttempts(id: string): Promise<void>;
  markSmsOtpUsed(id: string): Promise<void>;

  createPasswordResetToken(token: Omit<PasswordResetToken, "id" | "createdAt" | "usedAt">): Promise<PasswordResetToken>;
  getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: string): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<void>;

  createOauthAuthorizationCode(code: Omit<OauthAuthorizationCode, "id" | "createdAt" | "usedAt">): Promise<OauthAuthorizationCode>;
  getOauthAuthorizationCode(code: string): Promise<OauthAuthorizationCode | undefined>;
  markOauthCodeUsed(id: string): Promise<boolean>;
  deleteExpiredAuthorizationCodes(): Promise<void>;

  createOauthAccessToken(token: Omit<OauthAccessToken, "id" | "createdAt" | "revokedAt">): Promise<OauthAccessToken>;
  getOauthAccessTokenByHash(tokenHash: string): Promise<OauthAccessToken | undefined>;
  revokeOauthAccessToken(id: string): Promise<void>;
  revokeOauthAccessTokensByUserId(userId: string, appId?: string): Promise<void>;
  deleteExpiredAccessTokens(): Promise<void>;

  createOauthAuditLog(log: Omit<OauthAuditLog, "id" | "createdAt">): Promise<OauthAuditLog>;
  getOauthAuditLogs(limit?: number, clientId?: string, traceId?: string): Promise<OauthAuditLog[]>;
  getOauthAuditLogsByTraceId(traceId: string): Promise<OauthAuditLog[]>;
  getOauthAuditLogsByAppId(appId: string, limit?: number): Promise<OauthAuditLog[]>;
  getRecentOauthErrors(appId: string, limit?: number): Promise<OauthAuditLog[]>;

  createWebhookDelivery(delivery: InsertWebhookDelivery): Promise<WebhookDelivery>;
  updateWebhookDelivery(id: string, data: Partial<WebhookDelivery>): Promise<WebhookDelivery | undefined>;
  getWebhookDeliveriesByAppId(appId: string, limit?: number): Promise<WebhookDelivery[]>;
  getWebhookDeliveriesByEventId(eventId: string): Promise<WebhookDelivery[]>;
  getRecentWebhookFailures(appId: string, limit?: number): Promise<WebhookDelivery[]>;

  getIntegrationHealthMetrics(appId: string): Promise<IntegrationHealthMetrics | undefined>;
  upsertIntegrationHealthMetrics(metrics: InsertIntegrationHealthMetrics): Promise<IntegrationHealthMetrics>;
  updateIntegrationHealthMetrics(appId: string, data: Partial<IntegrationHealthMetrics>): Promise<IntegrationHealthMetrics | undefined>;
  incrementHealthMetricCounter(appId: string, counter: "oauthSuccess" | "oauthFailure" | "apiCallSuccess" | "apiCallFailure" | "webhookSuccess" | "webhookFailure"): Promise<void>;
  calculateHealthScore(appId: string): Promise<number>;
  getQuarantinedApps(): Promise<IntegrationHealthMetrics[]>;

  getPaymentGatewaySettings(): Promise<PaymentGatewaySettings[]>;
  getPaymentGatewaySettingsByGateway(gateway: "STRIPE" | "PAYPAL" | "COINBASE"): Promise<PaymentGatewaySettings | undefined>;
  getEnabledPaymentGateways(): Promise<PaymentGatewaySettings[]>;
  upsertPaymentGatewaySettings(settings: InsertPaymentGatewaySettings): Promise<PaymentGatewaySettings>;
  updatePaymentGatewaySettings(gateway: "STRIPE" | "PAYPAL" | "COINBASE", data: Partial<PaymentGatewaySettings>): Promise<PaymentGatewaySettings | undefined>;
  initializePaymentGateways(): Promise<void>;

  getMerchantSettings(): Promise<MerchantSettings | undefined>;
  updateMerchantSettings(data: Partial<MerchantSettings>): Promise<MerchantSettings>;
  initializeMerchantSettings(): Promise<void>;

  getOAuthIdentityByProvider(provider: "REPLIT" | "GOOGLE", providerUserId: string): Promise<OAuthIdentity | undefined>;
  getOAuthIdentitiesByUserId(userId: string): Promise<OAuthIdentity[]>;
  createOAuthIdentity(identity: Omit<OAuthIdentity, "id" | "createdAt">): Promise<OAuthIdentity>;
  updateOAuthIdentityLastLogin(id: string): Promise<void>;

  getReferralSettings(): Promise<ReferralSettings | undefined>;
  updateReferralSettings(data: Partial<ReferralSettings>): Promise<ReferralSettings | undefined>;
  getUserByReferralCode(code: string): Promise<User | undefined>;
  generateReferralCode(userId: string): Promise<string>;
  createReferral(referral: Omit<Referral, "id" | "createdAt" | "qualifiedAt" | "referrerBonusPaidAt" | "referredBonusPaidAt">): Promise<Referral>;
  getReferral(id: string): Promise<Referral | undefined>;
  getReferralByReferredUserId(referredUserId: string): Promise<Referral | undefined>;
  getReferralsByReferrerId(referrerId: string): Promise<Referral[]>;
  updateReferral(id: string, data: Partial<Referral>): Promise<Referral | undefined>;
  updateReferralFundedAmount(referredUserId: string, amountCents: number): Promise<void>;
  getReferralStats(userId: string): Promise<{ totalReferrals: number; qualifiedReferrals: number; pendingReferrals: number; totalEarnings: number }>;
  getAllReferrals(limit?: number): Promise<(Referral & { referrer: User; referredUser: User })[]>;

  // Stripe Customers
  getStripeCustomer(userId: string): Promise<StripeCustomer | undefined>;
  getStripeCustomerByStripeId(stripeCustomerId: string): Promise<StripeCustomer | undefined>;
  createStripeCustomer(customer: InsertStripeCustomer): Promise<StripeCustomer>;
  updateStripeCustomer(userId: string, data: Partial<StripeCustomer>): Promise<StripeCustomer | undefined>;

  // Credit Packs
  getCreditPacks(): Promise<CreditPack[]>;
  getActiveCreditPacks(): Promise<CreditPack[]>;
  getCreditPackBySku(sku: string): Promise<CreditPack | undefined>;
  createCreditPack(pack: InsertCreditPack): Promise<CreditPack>;
  updateCreditPack(id: string, data: Partial<CreditPack>): Promise<CreditPack | undefined>;

  // Wallet Ledger
  getLedgerEntriesByUserId(userId: string, limit?: number): Promise<WalletLedger[]>;
  getLedgerEntryByIdempotencyKey(key: string): Promise<WalletLedger | undefined>;
  createLedgerEntry(entry: InsertWalletLedger): Promise<WalletLedger>;
  getUserCreditBalance(userId: string): Promise<number>;

  // Autopay Settings
  getAutopaySettings(userId: string): Promise<AutopaySettings | undefined>;
  createAutopaySettings(settings: InsertAutopaySettings): Promise<AutopaySettings>;
  updateAutopaySettings(userId: string, data: Partial<AutopaySettings>): Promise<AutopaySettings | undefined>;

  // Autopay Attempts
  createAutopayAttempt(attempt: InsertAutopayAttempt): Promise<AutopayAttempt>;
  updateAutopayAttempt(id: string, data: Partial<AutopayAttempt>): Promise<AutopayAttempt | undefined>;
  getAutopayAttemptsByUserId(userId: string, limit?: number): Promise<AutopayAttempt[]>;
  countRecentAutopayAttempts(userId: string, since: Date): Promise<number>;

  // Checkout Sessions
  createCheckoutSession(session: InsertCheckoutSession): Promise<CheckoutSession>;
  getCheckoutSessionByStripeId(stripeSessionId: string): Promise<CheckoutSession | undefined>;
  updateCheckoutSession(id: string, data: Partial<CheckoutSession>): Promise<CheckoutSession | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getWallet(id: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
    return wallet || undefined;
  }

  async getWalletByUserId(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return wallet || undefined;
  }

  async createWallet(wallet: Omit<Wallet, "id" | "createdAt" | "updatedAt">): Promise<Wallet> {
    const [created] = await db.insert(wallets).values(wallet).returning();
    return created;
  }

  async updateWalletBalance(id: string, amountCents: number): Promise<Wallet | undefined> {
    const [updated] = await db
      .update(wallets)
      .set({
        balanceCents: sql`${wallets.balanceCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, id))
      .returning();
    return updated || undefined;
  }

  async getPaymentMethod(id: string): Promise<PaymentMethod | undefined> {
    const [method] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
    return method || undefined;
  }

  async getPaymentMethodsByUserId(userId: string): Promise<PaymentMethod[]> {
    return db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId))
      .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));
  }

  async createPaymentMethod(method: Omit<PaymentMethod, "id" | "createdAt" | "updatedAt">): Promise<PaymentMethod> {
    const [created] = await db.insert(paymentMethods).values(method).returning();
    return created;
  }

  async updatePaymentMethod(id: string, data: Partial<PaymentMethod>): Promise<PaymentMethod | undefined> {
    const [updated] = await db
      .update(paymentMethods)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentMethods.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePaymentMethod(id: string): Promise<boolean> {
    const result = await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
    return true;
  }

  async setDefaultPaymentMethod(userId: string, methodId: string): Promise<void> {
    await db
      .update(paymentMethods)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(paymentMethods.userId, userId));

    await db
      .update(paymentMethods)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(paymentMethods.id, methodId));
  }

  async getTransactionsByWalletId(walletId: string, limit = 50): Promise<WalletTransaction[]> {
    return db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit);
  }

  async createTransaction(transaction: Omit<WalletTransaction, "id" | "createdAt">): Promise<WalletTransaction> {
    const [created] = await db.insert(walletTransactions).values(transaction).returning();
    return created;
  }

  async updateTransactionStatus(id: string, status: "PENDING" | "COMPLETED" | "FAILED"): Promise<void> {
    await db.update(walletTransactions).set({ status }).where(eq(walletTransactions.id, id));
  }

  async updateTransactionExternalRef(id: string, externalRef: string, gateway: string): Promise<void> {
    const [tx] = await db.select().from(walletTransactions).where(eq(walletTransactions.id, id));
    if (tx) {
      const newDescription = `${tx.description} [${gateway}: ${externalRef.substring(0, 20)}...]`;
      await db.update(walletTransactions)
        .set({ description: newDescription })
        .where(eq(walletTransactions.id, id));
    }
  }

  async getAutoTopupRule(id: string): Promise<AutoTopupRule | undefined> {
    const [rule] = await db.select().from(autoTopupRules).where(eq(autoTopupRules.id, id));
    return rule || undefined;
  }

  async getAutoTopupRuleByUserId(userId: string): Promise<AutoTopupRule | undefined> {
    const [rule] = await db.select().from(autoTopupRules).where(eq(autoTopupRules.userId, userId));
    return rule || undefined;
  }

  async createAutoTopupRule(rule: Omit<AutoTopupRule, "id" | "createdAt" | "updatedAt">): Promise<AutoTopupRule> {
    const [created] = await db.insert(autoTopupRules).values(rule).returning();
    return created;
  }

  async updateAutoTopupRule(id: string, data: Partial<AutoTopupRule>): Promise<AutoTopupRule | undefined> {
    const [updated] = await db
      .update(autoTopupRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(autoTopupRules.id, id))
      .returning();
    return updated || undefined;
  }

  async getActiveAutoTopupRulesWithLowBalance(): Promise<(AutoTopupRule & { wallet: Wallet; paymentMethod: PaymentMethod })[]> {
    const result = await db
      .select()
      .from(autoTopupRules)
      .innerJoin(wallets, eq(autoTopupRules.walletId, wallets.id))
      .innerJoin(paymentMethods, eq(autoTopupRules.paymentMethodId, paymentMethods.id))
      .where(
        and(
          eq(autoTopupRules.active, true),
          sql`${wallets.balanceCents} < ${autoTopupRules.thresholdCents}`
        )
      );

    return result.map((row) => ({
      ...row.auto_topup_rules,
      wallet: row.wallets,
      paymentMethod: row.payment_methods,
    }));
  }

  async getApp(id: string): Promise<App | undefined> {
    const [app] = await db.select().from(apps).where(eq(apps.id, id));
    return app || undefined;
  }

  async getAppBySlug(slug: string): Promise<App | undefined> {
    const [app] = await db.select().from(apps).where(eq(apps.slug, slug));
    return app || undefined;
  }

  async getAppByClientId(clientId: string): Promise<App | undefined> {
    const [app] = await db.select().from(apps).where(eq(apps.clientId, clientId));
    return app || undefined;
  }

  async getAllApps(): Promise<App[]> {
    return db.select().from(apps).where(eq(apps.isActive, true)).orderBy(desc(apps.createdAt));
  }

  async createApp(app: Omit<App, "id" | "createdAt" | "updatedAt">): Promise<App> {
    const [created] = await db.insert(apps).values(app).returning();
    return created;
  }

  async updateApp(id: string, data: Partial<App>): Promise<App | undefined> {
    const [updated] = await db
      .update(apps)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(apps.id, id))
      .returning();
    return updated || undefined;
  }

  async getAppSubscription(userId: string, appId: string): Promise<AppSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(appSubscriptions)
      .where(and(eq(appSubscriptions.userId, userId), eq(appSubscriptions.appId, appId)));
    return subscription || undefined;
  }

  async getAppSubscriptionsByUserId(userId: string): Promise<(AppSubscription & { app: App })[]> {
    const result = await db
      .select()
      .from(appSubscriptions)
      .innerJoin(apps, eq(appSubscriptions.appId, apps.id))
      .where(eq(appSubscriptions.userId, userId));

    return result.map((row) => ({
      ...row.app_subscriptions,
      app: row.apps,
    }));
  }

  async getAppSubscriptionById(id: string): Promise<AppSubscription | undefined> {
    const [subscription] = await db.select().from(appSubscriptions).where(eq(appSubscriptions.id, id));
    return subscription || undefined;
  }

  async createAppSubscription(subscription: Omit<AppSubscription, "id" | "subscribedAt" | "currentPeriodStart">): Promise<AppSubscription> {
    const [created] = await db.insert(appSubscriptions).values(subscription).returning();
    return created;
  }

  async cancelAppSubscription(userId: string, appId: string): Promise<void> {
    await db
      .update(appSubscriptions)
      .set({ status: "CANCELLED", cancelledAt: new Date() })
      .where(and(eq(appSubscriptions.userId, userId), eq(appSubscriptions.appId, appId)));
  }

  async updateAppSubscription(id: string, data: Partial<AppSubscription>): Promise<AppSubscription | undefined> {
    const [updated] = await db
      .update(appSubscriptions)
      .set(data)
      .where(eq(appSubscriptions.id, id))
      .returning();
    return updated || undefined;
  }

  async getSubscriptionsDueToBill(): Promise<(AppSubscription & { app: App; user: User })[]> {
    const result = await db
      .select()
      .from(appSubscriptions)
      .innerJoin(apps, eq(appSubscriptions.appId, apps.id))
      .innerJoin(users, eq(appSubscriptions.userId, users.id))
      .where(
        and(
          eq(appSubscriptions.status, "ACTIVE"),
          sql`${appSubscriptions.nextBillingDate} IS NOT NULL AND ${appSubscriptions.nextBillingDate} <= NOW()`
        )
      );

    return result.map((row) => ({
      ...row.app_subscriptions,
      app: row.apps,
      user: row.users,
    }));
  }

  async incrementSubscriptionUsage(subscriptionId: string): Promise<void> {
    await db
      .update(appSubscriptions)
      .set({ totalUsageCount: sql`${appSubscriptions.totalUsageCount} + 1` })
      .where(eq(appSubscriptions.id, subscriptionId));
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return key || undefined;
  }

  async getApiKeysByUserId(userId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(hash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash));
    return key || undefined;
  }

  async createApiKey(key: Omit<ApiKey, "id" | "createdAt">): Promise<ApiKey> {
    const [created] = await db.insert(apiKeys).values(key).returning();
    return created;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    return true;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async getAppApiKey(id: string): Promise<AppApiKey | undefined> {
    const [key] = await db.select().from(appApiKeys).where(eq(appApiKeys.id, id));
    return key || undefined;
  }

  async getAppApiKeysByAppId(appId: string): Promise<AppApiKey[]> {
    return db
      .select()
      .from(appApiKeys)
      .where(and(eq(appApiKeys.appId, appId), sql`${appApiKeys.revokedAt} IS NULL`))
      .orderBy(desc(appApiKeys.createdAt));
  }

  async getAppApiKeyByHash(hash: string): Promise<(AppApiKey & { app: App }) | undefined> {
    const [result] = await db
      .select()
      .from(appApiKeys)
      .innerJoin(apps, eq(appApiKeys.appId, apps.id))
      .where(
        and(
          eq(appApiKeys.keyHash, hash),
          sql`${appApiKeys.revokedAt} IS NULL`
        )
      );
    if (!result) return undefined;
    return { ...result.app_api_keys, app: result.apps };
  }

  async getAllAppApiKeys(): Promise<(AppApiKey & { app: App })[]> {
    const result = await db
      .select()
      .from(appApiKeys)
      .innerJoin(apps, eq(appApiKeys.appId, apps.id))
      .orderBy(desc(appApiKeys.createdAt));
    return result.map((row) => ({ ...row.app_api_keys, app: row.apps }));
  }

  async createAppApiKey(key: Omit<AppApiKey, "id" | "createdAt" | "lastUsedAt" | "revokedAt">): Promise<AppApiKey> {
    const [created] = await db.insert(appApiKeys).values(key).returning();
    return created;
  }

  async revokeAppApiKey(id: string): Promise<boolean> {
    const [updated] = await db
      .update(appApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(appApiKeys.id, id))
      .returning();
    return !!updated;
  }

  async deleteAppApiKey(id: string): Promise<boolean> {
    const result = await db.delete(appApiKeys).where(eq(appApiKeys.id, id)).returning();
    return result.length > 0;
  }

  async updateAppApiKeyLastUsed(id: string): Promise<void> {
    await db.update(appApiKeys).set({ lastUsedAt: new Date() }).where(eq(appApiKeys.id, id));
  }

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<RefreshToken> {
    const [created] = await db
      .insert(refreshTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return created;
  }

  async getRefreshTokenByHash(hash: string): Promise<RefreshToken | undefined> {
    const [token] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
    return token || undefined;
  }

  async deleteRefreshToken(id: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, id));
  }

  async deleteRefreshTokensByUserId(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }

  async getAdminStats(): Promise<{
    totalUsers: number;
    totalApps: number;
    totalBalance: number;
    totalTransactions: number;
  }> {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [appCount] = await db.select({ count: sql<number>`count(*)` }).from(apps);
    const [balanceSum] = await db.select({ sum: sql<number>`coalesce(sum(balance_cents), 0)` }).from(wallets);
    const [txCount] = await db.select({ count: sql<number>`count(*)` }).from(walletTransactions);

    return {
      totalUsers: Number(userCount?.count || 0),
      totalApps: Number(appCount?.count || 0),
      totalBalance: Number(balanceSum?.sum || 0),
      totalTransactions: Number(txCount?.count || 0),
    };
  }

  async createAuditLog(log: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogsByUserId(userId: string, limit = 100): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async createWebhookEvent(event: Omit<WebhookEvent, "id" | "createdAt" | "processedAt">): Promise<WebhookEvent> {
    const [created] = await db.insert(webhookEvents).values(event).returning();
    return created;
  }

  async getWebhookEvent(id: string): Promise<WebhookEvent | undefined> {
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, id));
    return event || undefined;
  }

  async getPendingWebhookEvents(limit = 50): Promise<WebhookEvent[]> {
    return db
      .select()
      .from(webhookEvents)
      .where(
        sql`${webhookEvents.status} IN ('PENDING', 'RETRYING') 
            AND (${webhookEvents.nextRetryAt} IS NULL OR ${webhookEvents.nextRetryAt} <= NOW())`
      )
      .orderBy(webhookEvents.createdAt)
      .limit(limit);
  }

  async updateWebhookEventStatus(
    id: string, 
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYING", 
    result?: string
  ): Promise<WebhookEvent | undefined> {
    const updateData: Partial<WebhookEvent> = { 
      status,
      attempts: sql`${webhookEvents.attempts} + 1` as any,
    };

    if (result) {
      updateData.processingResult = result;
    }

    if (status === "COMPLETED" || status === "FAILED") {
      updateData.processedAt = new Date();
    }

    if (status === "RETRYING") {
      updateData.nextRetryAt = new Date(Date.now() + 60000);
    }

    const [updated] = await db
      .update(webhookEvents)
      .set(updateData)
      .where(eq(webhookEvents.id, id))
      .returning();
    return updated || undefined;
  }

  async getWebhookEvents(limit = 100): Promise<WebhookEvent[]> {
    return db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(limit);
  }

  async createSmsOtp(otp: Omit<SmsOtpCode, "id" | "createdAt" | "usedAt">): Promise<SmsOtpCode> {
    const [created] = await db.insert(smsOtpCodes).values(otp).returning();
    return created;
  }

  async getValidSmsOtp(phone: string, purpose: string): Promise<SmsOtpCode | undefined> {
    const [otp] = await db
      .select()
      .from(smsOtpCodes)
      .where(
        and(
          eq(smsOtpCodes.phone, phone),
          eq(smsOtpCodes.purpose, purpose),
          sql`${smsOtpCodes.usedAt} IS NULL`,
          sql`${smsOtpCodes.expiresAt} > NOW()`
        )
      )
      .orderBy(desc(smsOtpCodes.createdAt))
      .limit(1);
    return otp || undefined;
  }

  async getRecentSmsOtp(phone: string, withinMinutes: number): Promise<SmsOtpCode | undefined> {
    const [otp] = await db
      .select()
      .from(smsOtpCodes)
      .where(
        and(
          eq(smsOtpCodes.phone, phone),
          sql`${smsOtpCodes.createdAt} > NOW() - INTERVAL '${sql.raw(withinMinutes.toString())} minutes'`
        )
      )
      .orderBy(desc(smsOtpCodes.createdAt))
      .limit(1);
    return otp || undefined;
  }

  async incrementSmsOtpAttempts(id: string): Promise<void> {
    await db
      .update(smsOtpCodes)
      .set({ attempts: sql`${smsOtpCodes.attempts} + 1` })
      .where(eq(smsOtpCodes.id, id));
  }

  async markSmsOtpUsed(id: string): Promise<void> {
    await db
      .update(smsOtpCodes)
      .set({ usedAt: new Date() })
      .where(eq(smsOtpCodes.id, id));
  }

  async createPasswordResetToken(token: Omit<PasswordResetToken, "id" | "createdAt" | "usedAt">): Promise<PasswordResetToken> {
    const [created] = await db.insert(passwordResetTokens).values(token).returning();
    return created;
  }

  async getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    return token || undefined;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(sql`${passwordResetTokens.expiresAt} < NOW()`);
  }

  async createOauthAuthorizationCode(code: Omit<OauthAuthorizationCode, "id" | "createdAt" | "usedAt">): Promise<OauthAuthorizationCode> {
    const [created] = await db.insert(oauthAuthorizationCodes).values(code).returning();
    return created;
  }

  async getOauthAuthorizationCode(code: string): Promise<OauthAuthorizationCode | undefined> {
    const [authCode] = await db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code, code));
    return authCode || undefined;
  }

  async markOauthCodeUsed(id: string): Promise<boolean> {
    const result = await db
      .update(oauthAuthorizationCodes)
      .set({ usedAt: new Date() })
      .where(and(
        eq(oauthAuthorizationCodes.id, id),
        sql`${oauthAuthorizationCodes.usedAt} IS NULL`
      ))
      .returning({ id: oauthAuthorizationCodes.id });
    return result.length > 0;
  }

  async deleteExpiredAuthorizationCodes(): Promise<void> {
    await db
      .delete(oauthAuthorizationCodes)
      .where(sql`${oauthAuthorizationCodes.expiresAt} < NOW()`);
  }

  async createOauthAccessToken(token: Omit<OauthAccessToken, "id" | "createdAt" | "revokedAt">): Promise<OauthAccessToken> {
    const [created] = await db.insert(oauthAccessTokens).values(token).returning();
    return created;
  }

  async getOauthAccessTokenByHash(tokenHash: string): Promise<OauthAccessToken | undefined> {
    const [token] = await db
      .select()
      .from(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.tokenHash, tokenHash),
          sql`${oauthAccessTokens.revokedAt} IS NULL`,
          sql`${oauthAccessTokens.expiresAt} > NOW()`
        )
      );
    return token || undefined;
  }

  async revokeOauthAccessToken(id: string): Promise<void> {
    await db
      .update(oauthAccessTokens)
      .set({ revokedAt: new Date() })
      .where(eq(oauthAccessTokens.id, id));
  }

  async revokeOauthAccessTokensByUserId(userId: string, appId?: string): Promise<void> {
    if (appId) {
      await db
        .update(oauthAccessTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(oauthAccessTokens.userId, userId), eq(oauthAccessTokens.appId, appId)));
    } else {
      await db
        .update(oauthAccessTokens)
        .set({ revokedAt: new Date() })
        .where(eq(oauthAccessTokens.userId, userId));
    }
  }

  async deleteExpiredAccessTokens(): Promise<void> {
    await db
      .delete(oauthAccessTokens)
      .where(sql`${oauthAccessTokens.expiresAt} < NOW()`);
  }

  async createOauthAuditLog(log: Omit<OauthAuditLog, "id" | "createdAt">): Promise<OauthAuditLog> {
    const [created] = await db.insert(oauthAuditLogs).values(log).returning();
    return created;
  }

  async getOauthAuditLogs(limit = 100, clientId?: string, traceId?: string): Promise<OauthAuditLog[]> {
    let query = db.select().from(oauthAuditLogs);
    
    if (clientId && traceId) {
      query = query.where(and(eq(oauthAuditLogs.clientId, clientId), eq(oauthAuditLogs.traceId, traceId))) as typeof query;
    } else if (clientId) {
      query = query.where(eq(oauthAuditLogs.clientId, clientId)) as typeof query;
    } else if (traceId) {
      query = query.where(eq(oauthAuditLogs.traceId, traceId)) as typeof query;
    }
    
    return query.orderBy(desc(oauthAuditLogs.createdAt)).limit(limit);
  }

  async getOauthAuditLogsByTraceId(traceId: string): Promise<OauthAuditLog[]> {
    return db
      .select()
      .from(oauthAuditLogs)
      .where(eq(oauthAuditLogs.traceId, traceId))
      .orderBy(oauthAuditLogs.createdAt);
  }

  async getOauthAuditLogsByAppId(appId: string, limit = 100): Promise<OauthAuditLog[]> {
    return db
      .select()
      .from(oauthAuditLogs)
      .where(eq(oauthAuditLogs.appId, appId))
      .orderBy(desc(oauthAuditLogs.createdAt))
      .limit(limit);
  }

  async getRecentOauthErrors(appId: string, limit = 50): Promise<OauthAuditLog[]> {
    return db
      .select()
      .from(oauthAuditLogs)
      .where(and(eq(oauthAuditLogs.appId, appId), eq(oauthAuditLogs.status, "ERROR")))
      .orderBy(desc(oauthAuditLogs.createdAt))
      .limit(limit);
  }

  async createWebhookDelivery(delivery: InsertWebhookDelivery): Promise<WebhookDelivery> {
    const [created] = await db.insert(webhookDeliveries).values(delivery).returning();
    return created;
  }

  async updateWebhookDelivery(id: string, data: Partial<WebhookDelivery>): Promise<WebhookDelivery | undefined> {
    const [updated] = await db
      .update(webhookDeliveries)
      .set(data)
      .where(eq(webhookDeliveries.id, id))
      .returning();
    return updated || undefined;
  }

  async getWebhookDeliveriesByAppId(appId: string, limit = 100): Promise<WebhookDelivery[]> {
    return db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.appId, appId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
  }

  async getWebhookDeliveriesByEventId(eventId: string): Promise<WebhookDelivery[]> {
    return db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookEventId, eventId))
      .orderBy(webhookDeliveries.attemptNumber);
  }

  async getRecentWebhookFailures(appId: string, limit = 50): Promise<WebhookDelivery[]> {
    return db
      .select()
      .from(webhookDeliveries)
      .where(and(
        eq(webhookDeliveries.appId, appId),
        sql`${webhookDeliveries.status} != 'SUCCESS'`
      ))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
  }

  async getIntegrationHealthMetrics(appId: string): Promise<IntegrationHealthMetrics | undefined> {
    const [metrics] = await db
      .select()
      .from(integrationHealthMetrics)
      .where(eq(integrationHealthMetrics.appId, appId));
    return metrics || undefined;
  }

  async upsertIntegrationHealthMetrics(metrics: InsertIntegrationHealthMetrics): Promise<IntegrationHealthMetrics> {
    const existing = await this.getIntegrationHealthMetrics(metrics.appId);
    if (existing) {
      const [updated] = await db
        .update(integrationHealthMetrics)
        .set({ ...metrics, updatedAt: new Date() })
        .where(eq(integrationHealthMetrics.appId, metrics.appId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(integrationHealthMetrics).values(metrics).returning();
    return created;
  }

  async updateIntegrationHealthMetrics(appId: string, data: Partial<IntegrationHealthMetrics>): Promise<IntegrationHealthMetrics | undefined> {
    const [updated] = await db
      .update(integrationHealthMetrics)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(integrationHealthMetrics.appId, appId))
      .returning();
    return updated || undefined;
  }

  async incrementHealthMetricCounter(
    appId: string,
    counter: "oauthSuccess" | "oauthFailure" | "apiCallSuccess" | "apiCallFailure" | "webhookSuccess" | "webhookFailure"
  ): Promise<void> {
    const columnMap = {
      oauthSuccess: integrationHealthMetrics.oauthSuccessCount,
      oauthFailure: integrationHealthMetrics.oauthFailureCount,
      apiCallSuccess: integrationHealthMetrics.apiCallSuccessCount,
      apiCallFailure: integrationHealthMetrics.apiCallFailureCount,
      webhookSuccess: integrationHealthMetrics.webhookSuccessCount,
      webhookFailure: integrationHealthMetrics.webhookFailureCount,
    };

    const column = columnMap[counter];
    const isSuccess = counter.includes("Success");

    const existing = await this.getIntegrationHealthMetrics(appId);
    if (!existing) {
      await this.upsertIntegrationHealthMetrics({
        appId,
        [counter === "oauthSuccess" ? "oauthSuccessCount" : 
         counter === "oauthFailure" ? "oauthFailureCount" :
         counter === "apiCallSuccess" ? "apiCallSuccessCount" :
         counter === "apiCallFailure" ? "apiCallFailureCount" :
         counter === "webhookSuccess" ? "webhookSuccessCount" : "webhookFailureCount"]: 1,
        ...(isSuccess ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() }),
      });
      return;
    }

    await db
      .update(integrationHealthMetrics)
      .set({
        [counter === "oauthSuccess" ? "oauthSuccessCount" : 
         counter === "oauthFailure" ? "oauthFailureCount" :
         counter === "apiCallSuccess" ? "apiCallSuccessCount" :
         counter === "apiCallFailure" ? "apiCallFailureCount" :
         counter === "webhookSuccess" ? "webhookSuccessCount" : "webhookFailureCount"]: sql`${column} + 1`,
        ...(isSuccess ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(integrationHealthMetrics.appId, appId));

    await this.calculateHealthScore(appId);
  }

  async calculateHealthScore(appId: string): Promise<number> {
    const metrics = await this.getIntegrationHealthMetrics(appId);
    if (!metrics) return 100;

    const totalOauth = metrics.oauthSuccessCount + metrics.oauthFailureCount;
    const totalApi = metrics.apiCallSuccessCount + metrics.apiCallFailureCount;
    const totalWebhook = metrics.webhookSuccessCount + metrics.webhookFailureCount;

    let score = 100;
    
    if (totalOauth > 0) {
      const oauthSuccessRate = metrics.oauthSuccessCount / totalOauth;
      score -= (1 - oauthSuccessRate) * 40;
    }
    
    if (totalApi > 0) {
      const apiSuccessRate = metrics.apiCallSuccessCount / totalApi;
      score -= (1 - apiSuccessRate) * 30;
    }
    
    if (totalWebhook > 0) {
      const webhookSuccessRate = metrics.webhookSuccessCount / totalWebhook;
      score -= (1 - webhookSuccessRate) * 30;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const shouldQuarantine = score < 30;
    await db
      .update(integrationHealthMetrics)
      .set({
        healthScore: score,
        quarantined: shouldQuarantine,
        quarantinedAt: shouldQuarantine && !metrics.quarantined ? new Date() : metrics.quarantinedAt,
        quarantineReason: shouldQuarantine ? "Health score below threshold" : null,
        updatedAt: new Date(),
      })
      .where(eq(integrationHealthMetrics.appId, appId));

    return score;
  }

  async getQuarantinedApps(): Promise<IntegrationHealthMetrics[]> {
    return db
      .select()
      .from(integrationHealthMetrics)
      .where(eq(integrationHealthMetrics.quarantined, true));
  }

  async getPaymentGatewaySettings(): Promise<PaymentGatewaySettings[]> {
    return db
      .select()
      .from(paymentGatewaySettings)
      .orderBy(paymentGatewaySettings.displayOrder);
  }

  async getPaymentGatewaySettingsByGateway(gateway: "STRIPE" | "PAYPAL" | "COINBASE"): Promise<PaymentGatewaySettings | undefined> {
    const [settings] = await db
      .select()
      .from(paymentGatewaySettings)
      .where(eq(paymentGatewaySettings.gateway, gateway));
    return settings || undefined;
  }

  async getEnabledPaymentGateways(): Promise<PaymentGatewaySettings[]> {
    return db
      .select()
      .from(paymentGatewaySettings)
      .where(eq(paymentGatewaySettings.enabled, true))
      .orderBy(paymentGatewaySettings.displayOrder);
  }

  async upsertPaymentGatewaySettings(settings: InsertPaymentGatewaySettings): Promise<PaymentGatewaySettings> {
    const existing = await this.getPaymentGatewaySettingsByGateway(settings.gateway);
    if (existing) {
      const [updated] = await db
        .update(paymentGatewaySettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(paymentGatewaySettings.gateway, settings.gateway))
        .returning();
      return updated;
    }
    const [created] = await db.insert(paymentGatewaySettings).values(settings).returning();
    return created;
  }

  async updatePaymentGatewaySettings(
    gateway: "STRIPE" | "PAYPAL" | "COINBASE",
    data: Partial<PaymentGatewaySettings>
  ): Promise<PaymentGatewaySettings | undefined> {
    const [updated] = await db
      .update(paymentGatewaySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentGatewaySettings.gateway, gateway))
      .returning();
    return updated || undefined;
  }

  async initializePaymentGateways(): Promise<void> {
    const defaultGateways: InsertPaymentGatewaySettings[] = [
      {
        gateway: "STRIPE",
        enabled: false,
        sandboxMode: true,
        displayName: "Credit/Debit Card",
        displayOrder: 1,
        supportedMethods: ["CARD", "BANK_ACH"],
      },
      {
        gateway: "PAYPAL",
        enabled: false,
        sandboxMode: true,
        displayName: "PayPal / Venmo",
        displayOrder: 2,
        supportedMethods: ["PAYPAL", "VENMO"],
      },
      {
        gateway: "COINBASE",
        enabled: false,
        sandboxMode: true,
        displayName: "Cryptocurrency",
        displayOrder: 3,
        supportedMethods: ["CRYPTO"],
      },
    ];

    for (const gateway of defaultGateways) {
      const existing = await this.getPaymentGatewaySettingsByGateway(gateway.gateway);
      if (!existing) {
        await db.insert(paymentGatewaySettings).values(gateway);
      }
    }
  }

  async getMerchantSettings(): Promise<MerchantSettings | undefined> {
    const [settings] = await db.select().from(merchantSettings).limit(1);
    return settings || undefined;
  }

  async updateMerchantSettings(data: Partial<MerchantSettings>): Promise<MerchantSettings> {
    const existing = await this.getMerchantSettings();
    if (existing) {
      const [updated] = await db
        .update(merchantSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(merchantSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(merchantSettings)
      .values({
        ...data,
        id: randomUUID(),
      } as InsertMerchantSettings)
      .returning();
    return created;
  }

  async initializeMerchantSettings(): Promise<void> {
    const existing = await this.getMerchantSettings();
    if (!existing) {
      await db.insert(merchantSettings).values({
        id: randomUUID(),
        businessName: "Work Digital",
        defaultCurrency: "USD",
        statementDescriptor: "WORKDIGITAL",
      });
    }
  }

  async getOAuthIdentityByProvider(provider: "REPLIT" | "GOOGLE", providerUserId: string): Promise<OAuthIdentity | undefined> {
    const [identity] = await db
      .select()
      .from(oauthIdentities)
      .where(and(
        eq(oauthIdentities.provider, provider),
        eq(oauthIdentities.providerUserId, providerUserId)
      ));
    return identity || undefined;
  }

  async getOAuthIdentitiesByUserId(userId: string): Promise<OAuthIdentity[]> {
    return await db
      .select()
      .from(oauthIdentities)
      .where(eq(oauthIdentities.userId, userId));
  }

  async createOAuthIdentity(identity: Omit<OAuthIdentity, "id" | "createdAt">): Promise<OAuthIdentity> {
    const [created] = await db
      .insert(oauthIdentities)
      .values({
        ...identity,
        id: randomUUID(),
      })
      .returning();
    return created;
  }

  async updateOAuthIdentityLastLogin(id: string): Promise<void> {
    await db
      .update(oauthIdentities)
      .set({ lastLoginAt: new Date() })
      .where(eq(oauthIdentities.id, id));
  }

  async getReferralSettings(): Promise<ReferralSettings | undefined> {
    const [settings] = await db.select().from(referralSettings).limit(1);
    return settings || undefined;
  }

  async updateReferralSettings(data: Partial<ReferralSettings>): Promise<ReferralSettings | undefined> {
    const existing = await this.getReferralSettings();
    if (!existing) {
      const [created] = await db.insert(referralSettings).values({
        qualificationThresholdCents: data.qualificationThresholdCents ?? 2000,
        referrerBonusCents: data.referrerBonusCents ?? 500,
        referredBonusCents: data.referredBonusCents ?? 500,
        expirationDays: data.expirationDays ?? 90,
        maxReferralsPerUser: data.maxReferralsPerUser ?? 100,
        isActive: data.isActive ?? true,
      }).returning();
      return created;
    }
    const [updated] = await db
      .update(referralSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(referralSettings.id, existing.id))
      .returning();
    return updated || undefined;
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user || undefined;
  }

  async generateReferralCode(userId: string): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    let attempts = 0;
    do {
      code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.getUserByReferralCode(code);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    await db.update(users).set({ referralCode: code, updatedAt: new Date() }).where(eq(users.id, userId));
    return code;
  }

  async createReferral(referral: Omit<Referral, "id" | "createdAt" | "qualifiedAt" | "referrerBonusPaidAt" | "referredBonusPaidAt">): Promise<Referral> {
    const [created] = await db.insert(referrals).values(referral).returning();
    return created;
  }

  async getReferral(id: string): Promise<Referral | undefined> {
    const [referral] = await db.select().from(referrals).where(eq(referrals.id, id));
    return referral || undefined;
  }

  async getReferralByReferredUserId(referredUserId: string): Promise<Referral | undefined> {
    const [referral] = await db.select().from(referrals).where(eq(referrals.referredUserId, referredUserId));
    return referral || undefined;
  }

  async getReferralsByReferrerId(referrerId: string): Promise<Referral[]> {
    return await db.select().from(referrals).where(eq(referrals.referrerId, referrerId)).orderBy(desc(referrals.createdAt));
  }

  async updateReferral(id: string, data: Partial<Referral>): Promise<Referral | undefined> {
    const [updated] = await db.update(referrals).set(data).where(eq(referrals.id, id)).returning();
    return updated || undefined;
  }

  async updateReferralFundedAmount(referredUserId: string, amountCents: number): Promise<void> {
    const referral = await this.getReferralByReferredUserId(referredUserId);
    if (!referral || referral.status === 'REWARDED' || referral.status === 'EXPIRED') return;

    const newFundedAmount = (referral.referredUserFundedCents || 0) + amountCents;
    await db.update(referrals).set({
      referredUserFundedCents: newFundedAmount,
    }).where(eq(referrals.id, referral.id));

    if (newFundedAmount >= referral.qualificationThresholdCents && referral.status === 'PENDING') {
      await db.update(referrals).set({
        status: 'QUALIFIED',
        qualifiedAt: new Date(),
      }).where(eq(referrals.id, referral.id));
    }
  }

  async getReferralStats(userId: string): Promise<{ totalReferrals: number; qualifiedReferrals: number; pendingReferrals: number; totalEarnings: number }> {
    const userReferrals = await this.getReferralsByReferrerId(userId);
    const totalReferrals = userReferrals.length;
    const qualifiedReferrals = userReferrals.filter(r => r.status === 'QUALIFIED' || r.status === 'REWARDED').length;
    const pendingReferrals = userReferrals.filter(r => r.status === 'PENDING').length;
    const totalEarnings = userReferrals
      .filter(r => r.status === 'REWARDED')
      .reduce((sum, r) => sum + (r.referrerBonusCents || 0), 0);
    return { totalReferrals, qualifiedReferrals, pendingReferrals, totalEarnings };
  }

  async getAllReferrals(limit?: number): Promise<(Referral & { referrer: User; referredUser: User })[]> {
    const allReferrals = await db
      .select()
      .from(referrals)
      .orderBy(desc(referrals.createdAt))
      .limit(limit || 100);

    const result: (Referral & { referrer: User; referredUser: User })[] = [];
    for (const ref of allReferrals) {
      const referrer = await this.getUser(ref.referrerId);
      const referredUser = await this.getUser(ref.referredUserId);
      if (referrer && referredUser) {
        result.push({ ...ref, referrer, referredUser });
      }
    }
    return result;
  }

  // Stripe Customers
  async getStripeCustomer(userId: string): Promise<StripeCustomer | undefined> {
    const [customer] = await db.select().from(stripeCustomers).where(eq(stripeCustomers.userId, userId));
    return customer || undefined;
  }

  async getStripeCustomerByStripeId(stripeCustomerId: string): Promise<StripeCustomer | undefined> {
    const [customer] = await db.select().from(stripeCustomers).where(eq(stripeCustomers.stripeCustomerId, stripeCustomerId));
    return customer || undefined;
  }

  async createStripeCustomer(customer: InsertStripeCustomer): Promise<StripeCustomer> {
    const [created] = await db.insert(stripeCustomers).values(customer).returning();
    return created;
  }

  async updateStripeCustomer(userId: string, data: Partial<StripeCustomer>): Promise<StripeCustomer | undefined> {
    const [updated] = await db
      .update(stripeCustomers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stripeCustomers.userId, userId))
      .returning();
    return updated || undefined;
  }

  // Stripe Events - for webhook idempotency
  async getStripeEventById(stripeEventId: string): Promise<StripeEvent | undefined> {
    const [event] = await db.select().from(stripeEvents).where(eq(stripeEvents.stripeEventId, stripeEventId));
    return event || undefined;
  }

  async createStripeEvent(event: InsertStripeEvent): Promise<StripeEvent> {
    const [created] = await db.insert(stripeEvents).values(event).returning();
    return created;
  }

  async markStripeEventProcessed(stripeEventId: string, result?: string): Promise<StripeEvent | undefined> {
    const [updated] = await db
      .update(stripeEvents)
      .set({ processed: true, processingResult: result || "success", processedAt: new Date() })
      .where(eq(stripeEvents.stripeEventId, stripeEventId))
      .returning();
    return updated || undefined;
  }

  // Credit Packs
  async getCreditPacks(): Promise<CreditPack[]> {
    return db.select().from(creditPacks).orderBy(creditPacks.displayOrder);
  }

  async getActiveCreditPacks(): Promise<CreditPack[]> {
    return db.select().from(creditPacks).where(eq(creditPacks.isActive, true)).orderBy(creditPacks.displayOrder);
  }

  async getCreditPackBySku(sku: string): Promise<CreditPack | undefined> {
    const [pack] = await db.select().from(creditPacks).where(eq(creditPacks.sku, sku));
    return pack || undefined;
  }

  async createCreditPack(pack: InsertCreditPack): Promise<CreditPack> {
    const [created] = await db.insert(creditPacks).values(pack).returning();
    return created;
  }

  async updateCreditPack(id: string, data: Partial<CreditPack>): Promise<CreditPack | undefined> {
    const [updated] = await db
      .update(creditPacks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(creditPacks.id, id))
      .returning();
    return updated || undefined;
  }

  // Wallet Ledger
  async getLedgerEntriesByUserId(userId: string, limit?: number): Promise<WalletLedger[]> {
    return db.select().from(walletLedger).where(eq(walletLedger.userId, userId)).orderBy(desc(walletLedger.createdAt)).limit(limit || 100);
  }

  async getLedgerEntryByIdempotencyKey(key: string): Promise<WalletLedger | undefined> {
    const [entry] = await db.select().from(walletLedger).where(eq(walletLedger.idempotencyKey, key));
    return entry || undefined;
  }

  async createLedgerEntry(entry: InsertWalletLedger): Promise<WalletLedger> {
    const [created] = await db.insert(walletLedger).values(entry).returning();
    return created;
  }

  async getUserCreditBalance(userId: string): Promise<number> {
    const result = await db
      .select({ totalCredits: sql<number>`COALESCE(SUM(${walletLedger.creditsDelta}), 0)` })
      .from(walletLedger)
      .where(eq(walletLedger.userId, userId));
    return Number(result[0]?.totalCredits || 0);
  }

  // Autopay Settings
  async getAutopaySettings(userId: string): Promise<AutopaySettings | undefined> {
    const [settings] = await db.select().from(autopaySettings).where(eq(autopaySettings.userId, userId));
    return settings || undefined;
  }

  async createAutopaySettings(settings: InsertAutopaySettings): Promise<AutopaySettings> {
    const [created] = await db.insert(autopaySettings).values(settings).returning();
    return created;
  }

  async updateAutopaySettings(userId: string, data: Partial<AutopaySettings>): Promise<AutopaySettings | undefined> {
    const [updated] = await db
      .update(autopaySettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(autopaySettings.userId, userId))
      .returning();
    return updated || undefined;
  }

  // Autopay Attempts
  async createAutopayAttempt(attempt: InsertAutopayAttempt): Promise<AutopayAttempt> {
    const [created] = await db.insert(autopayAttempts).values(attempt).returning();
    return created;
  }

  async updateAutopayAttempt(id: string, data: Partial<AutopayAttempt>): Promise<AutopayAttempt | undefined> {
    const [updated] = await db
      .update(autopayAttempts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(autopayAttempts.id, id))
      .returning();
    return updated || undefined;
  }

  async getAutopayAttemptsByUserId(userId: string, limit?: number): Promise<AutopayAttempt[]> {
    return db.select().from(autopayAttempts).where(eq(autopayAttempts.userId, userId)).orderBy(desc(autopayAttempts.createdAt)).limit(limit || 20);
  }

  async countRecentAutopayAttempts(userId: string, since: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(autopayAttempts)
      .where(and(
        eq(autopayAttempts.userId, userId),
        eq(autopayAttempts.status, 'SUCCEEDED'),
        sql`${autopayAttempts.createdAt} >= ${since}`
      ));
    return Number(result[0]?.count || 0);
  }

  // Checkout Sessions
  async createCheckoutSession(session: InsertCheckoutSession): Promise<CheckoutSession> {
    const [created] = await db.insert(checkoutSessions).values(session).returning();
    return created;
  }

  async getCheckoutSessionByStripeId(stripeSessionId: string): Promise<CheckoutSession | undefined> {
    const [session] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.stripeSessionId, stripeSessionId));
    return session || undefined;
  }

  async updateCheckoutSession(id: string, data: Partial<CheckoutSession>): Promise<CheckoutSession | undefined> {
    const [updated] = await db
      .update(checkoutSessions)
      .set(data)
      .where(eq(checkoutSessions.id, id))
      .returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
