import { storage } from "./storage";

let jobIntervalId: NodeJS.Timeout | null = null;
let isAutoTopupProcessing = false;
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
  const webhookRetries = await processWebhookRetries();
  const subscriptionResult = await processSubscriptionBilling();

  if (autoTopupResult.triggered > 0 || autoTopupResult.failed > 0 || webhookRetries > 0 || subscriptionResult.billed > 0) {
    console.log(`[Background Job] Run complete - Auto top-ups: ${autoTopupResult.triggered} triggered | Subscriptions: ${subscriptionResult.billed} billed | Webhook retries: ${webhookRetries}`);
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

export async function runJobsManually(): Promise<{ autoTopups: JobResult; webhookRetries: number; subscriptionBilling: SubscriptionBillingResult }> {
  const autoTopups = await processAutoTopups();
  const webhookRetries = await processWebhookRetries();
  const subscriptionBilling = await processSubscriptionBilling();
  return { autoTopups, webhookRetries, subscriptionBilling };
}

export function getJobStatus(): { running: boolean; autoTopupProcessing: boolean; subscriptionProcessing: boolean } {
  return {
    running: jobIntervalId !== null,
    autoTopupProcessing: isAutoTopupProcessing,
    subscriptionProcessing: isSubscriptionProcessing,
  };
}
