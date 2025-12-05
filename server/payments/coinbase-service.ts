export interface CoinbaseChargeResult {
  success: boolean;
  chargeId?: string;
  hostedUrl?: string;
  expiresAt?: string;
  error?: string;
}

export interface CoinbaseChargeStatus {
  success: boolean;
  status?: string;
  timeline?: any[];
  payments?: any[];
  error?: string;
}

export function isCoinbaseConfigured(): boolean {
  return !!process.env.COINBASE_COMMERCE_API_KEY;
}

const COINBASE_API_URL = "https://api.commerce.coinbase.com";

async function getCoinbaseHeaders(): Promise<Record<string, string> | null> {
  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    "Content-Type": "application/json",
    "X-CC-Api-Key": apiKey,
    "X-CC-Version": "2018-03-22",
  };
}

export interface CreateCoinbaseChargeParams {
  amountCents: number;
  currency?: string;
  name: string;
  description: string;
  redirectUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export async function createCoinbaseCharge(
  params: CreateCoinbaseChargeParams
): Promise<{ chargeId: string; hostedUrl: string }> {
  const { amountCents, currency = "USD", name, description, redirectUrl, cancelUrl, metadata } = params;
  
  const headers = await getCoinbaseHeaders();
  if (!headers) {
    throw new Error("Coinbase Commerce not configured");
  }

  const amountValue = (amountCents / 100).toFixed(2);

  try {
    const response = await fetch(`${COINBASE_API_URL}/charges`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        description,
        pricing_type: "fixed_price",
        local_price: {
          amount: amountValue,
          currency,
        },
        metadata: metadata || {},
        redirect_url: redirectUrl,
        cancel_url: cancelUrl,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Coinbase charge creation error:", errorText);
      throw new Error("Failed to create Coinbase charge");
    }

    const data = await response.json();
    const charge = data.data;

    return {
      chargeId: charge.id,
      hostedUrl: charge.hosted_url,
    };
  } catch (error: any) {
    console.error("Coinbase charge creation error:", error);
    throw new Error(error.message || "Failed to create Coinbase charge");
  }
}

export async function getCoinbaseChargeStatus(
  chargeId: string
): Promise<CoinbaseChargeStatus> {
  const headers = await getCoinbaseHeaders();
  if (!headers) {
    return { success: false, error: "Coinbase Commerce not configured" };
  }

  try {
    const response = await fetch(`${COINBASE_API_URL}/charges/${chargeId}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Coinbase charge status error:", errorText);
      return { success: false, error: "Failed to get Coinbase charge status" };
    }

    const data = await response.json();
    const charge = data.data;

    const lastStatus = charge.timeline?.[charge.timeline.length - 1]?.status;

    return {
      success: true,
      status: lastStatus || "PENDING",
      timeline: charge.timeline,
      payments: charge.payments,
    };
  } catch (error: any) {
    console.error("Coinbase charge status error:", error);
    return { success: false, error: error.message };
  }
}

export async function cancelCoinbaseCharge(
  chargeId: string
): Promise<{ success: boolean; error?: string }> {
  const headers = await getCoinbaseHeaders();
  if (!headers) {
    return { success: false, error: "Coinbase Commerce not configured" };
  }

  try {
    const response = await fetch(`${COINBASE_API_URL}/charges/${chargeId}/cancel`, {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Coinbase charge cancel error:", errorText);
      return { success: false, error: "Failed to cancel Coinbase charge" };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Coinbase charge cancel error:", error);
    return { success: false, error: error.message };
  }
}

export function parseCoinbaseWebhook(
  rawBody: string,
  signature: string,
  webhookSecret: string
): { valid: boolean; event?: any; error?: string } {
  const crypto = require("crypto");
  
  const computedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (computedSignature !== signature) {
    return { valid: false, error: "Invalid webhook signature" };
  }

  try {
    const event = JSON.parse(rawBody);
    return { valid: true, event };
  } catch (error: any) {
    return { valid: false, error: "Invalid JSON payload" };
  }
}
