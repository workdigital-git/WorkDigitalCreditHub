import { storage } from "../storage";
import type { PaymentGatewaySettings } from "@shared/schema";

import {
  isStripeConfigured,
  getStripePublishableKey,
  createStripePaymentIntent,
  createStripeCustomer,
  chargePaymentMethod,
  createStripeSetupIntent,
  attachPaymentMethodToCustomer,
} from "./stripe-service";

import {
  isPayPalConfigured,
  getPayPalClientId,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderDetails,
} from "./paypal-service";

import {
  isCoinbaseConfigured,
  createCoinbaseCharge,
  getCoinbaseChargeStatus,
} from "./coinbase-service";

export type PaymentGateway = "STRIPE" | "PAYPAL" | "COINBASE";

export interface PaymentGatewayStatus {
  gateway: PaymentGateway;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  sandboxMode: boolean;
  supportedMethods: string[];
}

export interface ProcessPaymentResult {
  success: boolean;
  transactionId?: string;
  externalId?: string;
  redirectUrl?: string;
  clientSecret?: string;
  requiresAction?: boolean;
  error?: string;
}

export async function getAvailablePaymentGateways(): Promise<PaymentGatewayStatus[]> {
  const settings = await storage.getPaymentGatewaySettings();
  
  const statuses: PaymentGatewayStatus[] = [];

  for (const setting of settings) {
    let configured = false;

    switch (setting.gateway) {
      case "STRIPE":
        configured = await isStripeConfigured();
        break;
      case "PAYPAL":
        configured = isPayPalConfigured();
        break;
      case "COINBASE":
        configured = isCoinbaseConfigured();
        break;
    }

    statuses.push({
      gateway: setting.gateway,
      displayName: setting.displayName,
      enabled: setting.enabled,
      configured,
      sandboxMode: setting.sandboxMode,
      supportedMethods: setting.supportedMethods,
    });
  }

  return statuses;
}

export async function getEnabledPaymentGateways(): Promise<PaymentGatewayStatus[]> {
  const all = await getAvailablePaymentGateways();
  return all.filter((g) => g.enabled && g.configured);
}

export async function processPayment(
  gateway: PaymentGateway,
  amountCents: number,
  userId: string,
  options: {
    paymentMethodId?: string;
    stripeCustomerId?: string;
    returnUrl?: string;
    cancelUrl?: string;
    description?: string;
    metadata?: Record<string, string>;
  }
): Promise<ProcessPaymentResult> {
  const gatewaySettings = await storage.getPaymentGatewaySettingsByGateway(gateway);
  
  if (!gatewaySettings || !gatewaySettings.enabled) {
    return { success: false, error: `${gateway} is not enabled` };
  }

  switch (gateway) {
    case "STRIPE":
      return processStripePayment(amountCents, userId, options, gatewaySettings);
    case "PAYPAL":
      return processPayPalPayment(amountCents, userId, options, gatewaySettings);
    case "COINBASE":
      return processCoinbasePayment(amountCents, userId, options, gatewaySettings);
    default:
      return { success: false, error: "Unknown payment gateway" };
  }
}

async function processStripePayment(
  amountCents: number,
  userId: string,
  options: {
    paymentMethodId?: string;
    stripeCustomerId?: string;
    description?: string;
    metadata?: Record<string, string>;
  },
  settings: PaymentGatewaySettings
): Promise<ProcessPaymentResult> {
  if (!await isStripeConfigured()) {
    return { success: false, error: "Stripe is not configured" };
  }

  const metadata = {
    userId,
    ...options.metadata,
  };

  if (options.paymentMethodId && options.stripeCustomerId) {
    const result = await chargePaymentMethod(
      amountCents,
      options.paymentMethodId,
      options.stripeCustomerId,
      options.description || "Wallet Funding"
    );

    if (result.success) {
      return {
        success: true,
        externalId: result.paymentIntentId,
        requiresAction: result.requiresAction,
      };
    }
    return { success: false, error: result.error };
  }

  const result = await createStripePaymentIntent(
    amountCents,
    "usd",
    options.stripeCustomerId,
    options.paymentMethodId,
    metadata
  );

  if (result.success) {
    return {
      success: true,
      externalId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      requiresAction: result.requiresAction,
    };
  }

  return { success: false, error: result.error };
}

async function processPayPalPayment(
  amountCents: number,
  userId: string,
  options: {
    returnUrl?: string;
    cancelUrl?: string;
    description?: string;
  },
  settings: PaymentGatewaySettings
): Promise<ProcessPaymentResult> {
  if (!isPayPalConfigured()) {
    return { success: false, error: "PayPal is not configured" };
  }

  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000"}`;
  const returnUrl = options.returnUrl || `${baseUrl}/wallet?payment=success&gateway=paypal`;
  const cancelUrl = options.cancelUrl || `${baseUrl}/wallet?payment=cancel&gateway=paypal`;

  const result = await createPayPalOrder(
    amountCents,
    "USD",
    settings.sandboxMode,
    returnUrl,
    cancelUrl,
    options.description
  );

  if (result.success) {
    return {
      success: true,
      externalId: result.orderId,
      redirectUrl: result.approvalUrl,
    };
  }

  return { success: false, error: result.error };
}

async function processCoinbasePayment(
  amountCents: number,
  userId: string,
  options: {
    returnUrl?: string;
    cancelUrl?: string;
    description?: string;
    metadata?: Record<string, string>;
  },
  settings: PaymentGatewaySettings
): Promise<ProcessPaymentResult> {
  if (!isCoinbaseConfigured()) {
    return { success: false, error: "Coinbase Commerce is not configured" };
  }

  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000"}`;
  const returnUrl = options.returnUrl || `${baseUrl}/wallet?payment=success&gateway=coinbase`;
  const cancelUrl = options.cancelUrl || `${baseUrl}/wallet?payment=cancel&gateway=coinbase`;

  const result = await createCoinbaseCharge(
    amountCents,
    "USD",
    "Wallet Funding",
    options.description || "Add funds to your Work Digital Credits wallet",
    returnUrl,
    cancelUrl,
    { userId, ...options.metadata }
  );

  if (result.success) {
    return {
      success: true,
      externalId: result.chargeId,
      redirectUrl: result.hostedUrl,
    };
  }

  return { success: false, error: result.error };
}

export async function confirmPayment(
  gateway: PaymentGateway,
  externalId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  const settings = await storage.getPaymentGatewaySettingsByGateway(gateway);
  if (!settings) {
    return { success: false, error: "Gateway not found" };
  }

  switch (gateway) {
    case "PAYPAL":
      const paypalResult = await capturePayPalOrder(externalId, settings.sandboxMode);
      return {
        success: paypalResult.success,
        status: paypalResult.status,
        error: paypalResult.error,
      };

    case "COINBASE":
      const coinbaseResult = await getCoinbaseChargeStatus(externalId);
      const isCompleted = coinbaseResult.status === "COMPLETED";
      return {
        success: isCompleted,
        status: coinbaseResult.status,
        error: coinbaseResult.error,
      };

    case "STRIPE":
      return { success: true, status: "COMPLETED" };

    default:
      return { success: false, error: "Unknown gateway" };
  }
}

export async function getClientConfig(): Promise<{
  stripe?: { publishableKey: string };
  paypal?: { clientId: string; sandboxMode: boolean };
}> {
  const config: any = {};

  const stripeKey = await getStripePublishableKey();
  if (stripeKey) {
    config.stripe = { publishableKey: stripeKey };
  }

  const paypalClientId = getPayPalClientId();
  const paypalSettings = await storage.getPaymentGatewaySettingsByGateway("PAYPAL");
  if (paypalClientId && paypalSettings) {
    config.paypal = { 
      clientId: paypalClientId, 
      sandboxMode: paypalSettings.sandboxMode 
    };
  }

  return config;
}

export {
  isStripeConfigured,
  getStripePublishableKey,
  createStripePaymentIntent,
  createStripeCustomer,
  createStripeSetupIntent,
  attachPaymentMethodToCustomer,
  chargePaymentMethod,
} from "./stripe-service";

export {
  isPayPalConfigured,
  getPayPalClientId,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderDetails,
} from "./paypal-service";

export {
  isCoinbaseConfigured,
  createCoinbaseCharge,
  getCoinbaseChargeStatus,
  cancelCoinbaseCharge,
} from "./coinbase-service";
