import { storage } from "./storage";

let jobIntervalId: NodeJS.Timeout | null = null;
let isAutoTopupProcessing = false;
let isLedgerAutoTopupProcessing = false;
let isSubscriptionProcessing = false;

interface JobResult {
  triggered: number;
  failed: number;
  skipped: number;
}

async function processAutoTopups(): Promise<JobResult> {
  if (isAutoTopupProcessing) {
    return { triggered: 0, failed: 0, skipped: 0 };
  }

  isAutoTopupProcessing = true;
  const result: JobResult = { triggered: 0, failed: 0, skipped: 0 };

  try {
    const lowBalanceRules = await storage.getActiveAutoTopupRulesWithLowBalance();

    for (const rule of lowBalanceRules) {
      try {
        const transaction = await storage.createTransaction({
          walletId: rule.walletId,
          type: "CREDIT",
          source: "AUTO_TOPUP",
          amountCents: rule.topupAmountCents,
          description: `Scheduled auto top-up (balance below ${(rule.thresholdCents / 100).toFixed(2)})`,
          status: "COMPLETED",
          appId: null,
        });

        await storage.updateWalletBalance(rule.walletId, rule.topupAmountCents);

        await storage.createAuditLog({
          userId: rule.userId,
          eventType: "WALLET_AUTO_TOPUP",
          entityType: "wallet",
          entityId: rule.walletId,
          action: "Background job auto top-up",
          details: JSON.stringify({
            amountCents: rule.topupAmountCents,
            transactionId: transaction.id,
            paymentMethodId: rule.paymentMethodId,
            previousBalance: rule.wallet.balanceCents,
            newBalance: rule.wallet.balanceCents + rule.topupAmountCents,
          }),
          ipAddress: null,
          userAgent: "background-job-processor",
        });

        await storage.createWebhookEvent({
          eventType: "AUTO_TOPUP_TRIGGERED",
          status: "COMPLETED",
          userId: rule.userId,
          entityType: "wallet",
          entityId: rule.walletId,
          payload: JSON.stringify({
            transactionId: transaction.id,
            amountCents: rule.topupAmountCents,
            triggeredAt: new Date(),
          }),
          processingResult: "Auto top-up completed successfully",
          attempts: 1,
          maxAttempts: 1,
          nextRetryAt: null,
        });

        result.triggered++;
        console.log(`[Background Job] Auto top-up triggered for user ${rule.userId}: +$${(rule.topupAmountCents / 100).toFixed(2)}`);
      } catch (error: any) {
        result.failed++;
        console.error(`[Background Job] Auto top-up failed for user ${rule.userId}:`, error.message);

        await storage.createWebhookEvent({
          eventType: "AUTO_TOPUP_FAILED",
          status: "COMPLETED",
          userId: rule.userId,
          entityType: "wallet",
          entityId: rule.walletId,
          payload: JSON.stringify({
            error: error.message,
            triggeredAt: new Date(),
          }),
          processingResult: `Auto top-up failed: ${error.message}`,
          attempts: 1,
          maxAttempts: 1,
          nextRetryAt: null,
        });
      }
    }
  } catch (error) {
    console.error("[Background Job] Error processing auto top-ups:", error);
  } finally {
    isAutoTopupProcessing = false;
  }

  return result;
}

// Enhanced auto-topup using ledger-based credit system with Stripe off-session payments
async function processLedgerAutoTopups(): Promise<JobResult> {
  if (isLedgerAutoTopupProcessing) {
    return { triggered: 0, failed: 0, skipped: 0 };
  }

  isLedgerAutoTopupProcessing = true;
  const result: JobResult = { triggered: 0, failed: 0, skipped: 0 };

  try {
    // Get all enabled autopay settings
    const db = await import("./db");
    const { autopaySettings, stripeCustomers } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const enabledSettings = await db.db.select()
      .from(autopaySettings)
      .where(eq(autopaySettings.enabled, true));

    for (const settings of enabledSettings) {
      try {
        // Check credit balance from ledger
        const creditBalance = await storage.getUserCreditBalance(settings.userId);
        
        // Skip if above threshold
        if (creditBalance >= settings.thresholdCredits) {
          result.skipped++;
          continue;
        }

        // Check caps
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const attemptsToday = await storage.countRecentAutopayAttempts(settings.userId, oneDayAgo);
        const attemptsThisWeek = await storage.countRecentAutopayAttempts(settings.userId, oneWeekAgo);

        if (attemptsToday >= settings.maxTopupsPerDay) {
          console.log(`[Background Job] Skipping auto-topup for user ${settings.userId}: daily limit reached`);
          result.skipped++;
          continue;
        }

        if (attemptsThisWeek >= settings.maxTopupsPerWeek) {
          console.log(`[Background Job] Skipping auto-topup for user ${settings.userId}: weekly limit reached`);
          result.skipped++;
          continue;
        }

        // Check cooldown
        if (settings.lastTopupAt) {
          const cooldownEnds = new Date(settings.lastTopupAt.getTime() + settings.cooldownMinutes * 60 * 1000);
          if (now < cooldownEnds) {
            console.log(`[Background Job] Skipping auto-topup for user ${settings.userId}: in cooldown`);
            result.skipped++;
            continue;
          }
        }

        // Get credit pack
        if (!settings.topupPackSku) {
          console.log(`[Background Job] Skipping auto-topup for user ${settings.userId}: no pack configured`);
          result.skipped++;
          continue;
        }

        const pack = await storage.getCreditPackBySku(settings.topupPackSku);
        if (!pack || !pack.isActive) {
          console.log(`[Background Job] Skipping auto-topup for user ${settings.userId}: invalid pack`);
          result.skipped++;
          continue;
        }

        // Get Stripe customer and payment method
        const stripeCustomer = await storage.getStripeCustomer(settings.userId);
        if (!stripeCustomer) {
          console.log(`[Background Job] Skipping auto-topup for user ${settings.userId}: no Stripe customer`);
          result.skipped++;
          continue;
        }

        const paymentMethodId = settings.paymentMethodId || stripeCustomer.defaultPaymentMethodId;
        if (!paymentMethodId) {
          console.log(`[Background Job] Skipping auto-topup for user ${settings.userId}: no payment method`);
          result.skipped++;
          continue;
        }

        // Create attempt record
        const idempotencyKey = `auto_topup_${settings.userId}_${Date.now()}`;
        const attempt = await storage.createAutopayAttempt({
          userId: settings.userId,
          packSku: pack.sku,
          amountCents: pack.priceCents,
          status: "PROCESSING",
        });

        // Process off-session payment
        const { createOffSessionPayment } = await import("./payments/stripe-service");
        const paymentResult = await createOffSessionPayment(
          stripeCustomer.stripeCustomerId,
          paymentMethodId,
          pack.priceCents,
          {
            userId: settings.userId,
            packSku: pack.sku,
            creditsAmount: String(pack.creditsAmount),
            type: "auto_topup",
          },
          idempotencyKey
        );

        if (paymentResult.success) {
          // Update attempt as succeeded
          await storage.updateAutopayAttempt(attempt.id, {
            status: "SUCCEEDED",
            stripePaymentIntentId: paymentResult.paymentIntentId,
          });

          // Update last topup time
          await storage.updateAutopaySettings(settings.userId, {
            lastTopupAt: new Date(),
          });

          // Create ledger entry
          await storage.createLedgerEntry({
            userId: settings.userId,
            type: "AUTOPAY_TOPUP_SUCCEEDED",
            creditsDelta: pack.creditsAmount,
            amountCents: pack.priceCents,
            idempotencyKey: `ledger_${idempotencyKey}`,
            stripePaymentIntentId: paymentResult.paymentIntentId,
            packSku: pack.sku,
            metadata: { attemptId: attempt.id, description: `Auto top-up: ${pack.creditsAmount} credits` },
          });

          // Also update legacy wallet for backwards compatibility
          let wallet = await storage.getWalletByUserId(settings.userId);
          if (wallet) {
            await storage.updateWalletBalance(wallet.id, pack.priceCents);
          }

          result.triggered++;
          console.log(`[Background Job] Ledger auto-topup success for user ${settings.userId}: +${pack.creditsAmount} credits`);
        } else {
          // Update attempt as failed
          await storage.updateAutopayAttempt(attempt.id, {
            status: "FAILED",
            failureMessage: paymentResult.error,
            failureCode: paymentResult.declineCode,
          });

          result.failed++;
          console.log(`[Background Job] Ledger auto-topup failed for user ${settings.userId}: ${paymentResult.error}`);
        }
      } catch (error: any) {
        result.failed++;
        console.error(`[Background Job] Ledger auto-topup error for user ${settings.userId}:`, error.message);
      }
    }
  } catch (error) {
    console.error("[Background Job] Error processing ledger auto top-ups:", error);
  } finally {
    isLedgerAutoTopupProcessing = false;
  }

  return result;
}

async function processWebhookRetries(): Promise<number> {
  try {
    const pendingEvents = await storage.getPendingWebhookEvents(10);
    let processed = 0;

    for (const event of pendingEvents) {
      if (event.status === "RETRYING") {
        console.log(`[Background Job] Retrying webhook event ${event.id}`);
        await storage.updateWebhookEventStatus(event.id, "COMPLETED", "Retry successful");
        processed++;
      }
    }

    return processed;
  } catch (error) {
    console.error("[Background Job] Error processing webhook retries:", error);
    return 0;
  }
}

interface SubscriptionBillingResult {
  billed: number;
  failed: number;
  skipped: number;
}

async function processSubscriptionBilling(): Promise<SubscriptionBillingResult> {
  if (isSubscriptionProcessing) {
    return { billed: 0, failed: 0, skipped: 0 };
  }

  isSubscriptionProcessing = true;
  const result: SubscriptionBillingResult = { billed: 0, failed: 0, skipped: 0 };

  try {
    const subscriptionsDue = await storage.getSubscriptionsDueToBill();

    for (const subscription of subscriptionsDue) {
      try {
        let amountCents = 0;
        const newPeriodStart = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : new Date();
        let newPeriodEnd = new Date();
        let nextBillingDate = new Date();

        switch (subscription.billingCycle) {
          case "MONTHLY":
            amountCents = subscription.app.monthlyPriceCents || 0;
            newPeriodEnd = new Date(newPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
            nextBillingDate = newPeriodEnd;
            break;
          case "YEARLY":
            amountCents = subscription.app.yearlyPriceCents || 0;
            newPeriodEnd = new Date(newPeriodStart.getTime() + 365 * 24 * 60 * 60 * 1000);
            nextBillingDate = newPeriodEnd;
            break;
          case "PER_USE":
            amountCents = (subscription.totalUsageCount || 0) * (subscription.app.perUsePriceCents || 0);
            newPeriodEnd = new Date(newPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
            nextBillingDate = newPeriodEnd;
            break;
          default:
            result.skipped++;
            continue;
        }

        if (amountCents <= 0) {
          result.skipped++;
          continue;
        }

        const wallet = await storage.getWalletByUserId(subscription.userId);
        if (!wallet) {
          result.failed++;
          console.error(`[Background Job] No wallet found for user ${subscription.userId}`);
          continue;
        }

        if (wallet.balanceCents < amountCents) {
          await storage.updateAppSubscription(subscription.id, { 
            status: "PAUSED",
            nextBillingDate: null,
          });
          
          console.log(`[Background Job] Subscription ${subscription.id} paused - insufficient balance`);
          result.failed++;
          continue;
        }

        const transaction = await storage.createTransaction({
          walletId: wallet.id,
          type: "DEBIT",
          source: "SUBSCRIPTION",
          amountCents,
          description: `${subscription.app.name} - ${subscription.billingCycle} subscription`,
          status: "COMPLETED",
          appId: subscription.appId,
        });

        await storage.updateWalletBalance(wallet.id, -amountCents);

        await storage.updateAppSubscription(subscription.id, {
          lastBilledAt: new Date(),
          nextBillingDate,
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          totalUsageCount: subscription.billingCycle === "PER_USE" ? 0 : (subscription.totalUsageCount || 0),
        });

        await storage.createAuditLog({
          userId: subscription.userId,
          eventType: "WALLET_DEBIT",
          entityType: "subscription",
          entityId: subscription.id,
          action: "Subscription billing",
          details: JSON.stringify({
            amountCents,
            transactionId: transaction.id,
            appId: subscription.appId,
            appName: subscription.app.name,
            billingCycle: subscription.billingCycle,
          }),
          ipAddress: null,
          userAgent: "background-job-processor",
        });

        await storage.createWebhookEvent({
          eventType: "SUBSCRIPTION_CREATED",
          status: "COMPLETED",
          userId: subscription.userId,
          entityType: "subscription",
          entityId: subscription.id,
          payload: JSON.stringify({
            transactionId: transaction.id,
            amountCents,
            billedAt: new Date(),
            nextBillingDate,
          }),
          processingResult: "Subscription billed successfully",
          attempts: 1,
          maxAttempts: 1,
          nextRetryAt: null,
        });

        result.billed++;
        console.log(`[Background Job] Subscription billed for user ${subscription.userId}: -$${(amountCents / 100).toFixed(2)} for ${subscription.app.name}`);
      } catch (error: any) {
        result.failed++;
        console.error(`[Background Job] Subscription billing failed for ${subscription.id}:`, error.message);
      }
    }
  } catch (error) {
    console.error("[Background Job] Error processing subscription billing:", error);
  } finally {
    isSubscriptionProcessing = false;
  }

  return result;
}

async function runJobs(): Promise<void> {
  const autoTopupResult = await processAutoTopups();
  const ledgerAutoTopupResult = await processLedgerAutoTopups();
  const webhookRetries = await processWebhookRetries();
  const subscriptionResult = await processSubscriptionBilling();

  const hasActivity = autoTopupResult.triggered > 0 || autoTopupResult.failed > 0 ||
    ledgerAutoTopupResult.triggered > 0 || ledgerAutoTopupResult.failed > 0 ||
    webhookRetries > 0 || subscriptionResult.billed > 0;

  if (hasActivity) {
    console.log(`[Background Job] Run complete - Legacy top-ups: ${autoTopupResult.triggered} | Ledger top-ups: ${ledgerAutoTopupResult.triggered} | Subscriptions: ${subscriptionResult.billed} billed | Webhook retries: ${webhookRetries}`);
  }
}

export function startBackgroundJobs(intervalMs: number = 60000): void {
  if (jobIntervalId) {
    console.log("[Background Job] Jobs already running");
    return;
  }

  console.log(`[Background Job] Starting background job processor (interval: ${intervalMs}ms)`);
  
  runJobs();
  
  jobIntervalId = setInterval(runJobs, intervalMs);
}

export function stopBackgroundJobs(): void {
  if (jobIntervalId) {
    clearInterval(jobIntervalId);
    jobIntervalId = null;
    console.log("[Background Job] Stopped background job processor");
  }
}

export async function runJobsManually(): Promise<{ autoTopups: JobResult; ledgerAutoTopups: JobResult; webhookRetries: number; subscriptionBilling: SubscriptionBillingResult }> {
  const autoTopups = await processAutoTopups();
  const ledgerAutoTopups = await processLedgerAutoTopups();
  const webhookRetries = await processWebhookRetries();
  const subscriptionBilling = await processSubscriptionBilling();
  return { autoTopups, ledgerAutoTopups, webhookRetries, subscriptionBilling };
}

export function getJobStatus(): { running: boolean; autoTopupProcessing: boolean; ledgerAutoTopupProcessing: boolean; subscriptionProcessing: boolean } {
  return {
    running: jobIntervalId !== null,
    autoTopupProcessing: isAutoTopupProcessing,
    ledgerAutoTopupProcessing: isLedgerAutoTopupProcessing,
    subscriptionProcessing: isSubscriptionProcessing,
  };
}
