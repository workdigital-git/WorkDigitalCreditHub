import * as crypto from "crypto";

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
  return !!(process.env.COINBASE_COMMERCE_API_KEY || 
    (process.env.COINBASE_API_KEYNAME && process.env.COINBASE_PRIVATE_KEY));
}

export function getCoinbaseMode(): "commerce" | "cdp" | null {
  if (process.env.COINBASE_COMMERCE_API_KEY) return "commerce";
  if (process.env.COINBASE_API_KEYNAME && process.env.COINBASE_PRIVATE_KEY) return "cdp";
  return null;
}

const COINBASE_COMMERCE_URL = "https://api.commerce.coinbase.com";
const COINBASE_CDP_URL = "https://api.coinbase.com";

function generateCDPJWT(): string | null {
  const keyName = process.env.COINBASE_API_KEYNAME;
  const privateKey = process.env.COINBASE_PRIVATE_KEY;
  
  if (!keyName || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", typ: "JWT", kid: keyName };
  const payload = {
    sub: keyName,
    iss: "cdp",
    aud: ["retail_rest_api_proxy"],
    nbf: now,
    exp: now + 120,
  };

  const base64url = (obj: any) => 
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  
  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const message = `${headerB64}.${payloadB64}`;

  try {
    const formattedKey = privateKey.includes("-----BEGIN") 
      ? privateKey 
      : `-----BEGIN EC PRIVATE KEY-----\n${privateKey}\n-----END EC PRIVATE KEY-----`;
    
    const sign = crypto.createSign("SHA256");
    sign.update(message);
    const signature = sign.sign(formattedKey, "base64url");
    
    return `${message}.${signature}`;
  } catch (error) {
    console.error("Failed to generate CDP JWT:", error);
    return null;
  }
}

async function getCoinbaseHeaders(): Promise<{ headers: Record<string, string>; baseUrl: string } | null> {
  const commerceKey = process.env.COINBASE_COMMERCE_API_KEY;
  
  if (commerceKey) {
    return {
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": commerceKey,
        "X-CC-Version": "2018-03-22",
      },
      baseUrl: COINBASE_COMMERCE_URL,
    };
  }

  const jwt = generateCDPJWT();
  if (jwt) {
    return {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      baseUrl: COINBASE_CDP_URL,
    };
  }

  return null;
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
  
  const config = await getCoinbaseHeaders();
  if (!config) {
    throw new Error("Coinbase not configured");
  }

  const amountValue = (amountCents / 100).toFixed(2);
  const mode = getCoinbaseMode();

  try {
    if (mode === "commerce") {
      const response = await fetch(`${config.baseUrl}/charges`, {
        method: "POST",
        headers: config.headers,
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
        console.error("Coinbase Commerce charge creation error:", errorText);
        throw new Error("Failed to create Coinbase charge");
      }

      const data = await response.json();
      const charge = data.data;

      return {
        chargeId: charge.id,
        hostedUrl: charge.hosted_url,
      };
    } else {
      const response = await fetch(`${config.baseUrl}/v2/charges`, {
        method: "POST",
        headers: config.headers,
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
        console.error("Coinbase CDP charge creation error:", errorText);
        throw new Error("Failed to create Coinbase charge");
      }

      const data = await response.json();
      return {
        chargeId: data.data?.id || data.id,
        hostedUrl: data.data?.hosted_url || data.hosted_url,
      };
    }
  } catch (error: any) {
    console.error("Coinbase charge creation error:", error);
    throw new Error(error.message || "Failed to create Coinbase charge");
  }
}

export async function getCoinbaseChargeStatus(
  chargeId: string
): Promise<CoinbaseChargeStatus> {
  const config = await getCoinbaseHeaders();
  if (!config) {
    return { success: false, error: "Coinbase not configured" };
  }

  const mode = getCoinbaseMode();
  const endpoint = mode === "commerce" 
    ? `${config.baseUrl}/charges/${chargeId}`
    : `${config.baseUrl}/v2/charges/${chargeId}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: config.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Coinbase charge status error:", errorText);
      return { success: false, error: "Failed to get Coinbase charge status" };
    }

    const data = await response.json();
    const charge = data.data || data;

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
  const config = await getCoinbaseHeaders();
  if (!config) {
    return { success: false, error: "Coinbase not configured" };
  }

  const mode = getCoinbaseMode();
  const endpoint = mode === "commerce"
    ? `${config.baseUrl}/charges/${chargeId}/cancel`
    : `${config.baseUrl}/v2/charges/${chargeId}/cancel`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: config.headers,
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
