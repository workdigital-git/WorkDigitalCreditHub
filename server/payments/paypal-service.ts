export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  sandboxMode: boolean;
}

export interface PayPalOrderResult {
  success: boolean;
  orderId?: string;
  approvalUrl?: string;
  error?: string;
}

export interface PayPalCaptureResult {
  success: boolean;
  captureId?: string;
  status?: string;
  error?: string;
}

function getPayPalBaseUrl(sandboxMode: boolean): string {
  return sandboxMode
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export function isPayPalConfigured(): boolean {
  const hasClientId = !!process.env.PAYPAL_CLIENT_ID;
  const hasSecret = !!(process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET);
  return hasClientId && hasSecret;
}

export function getPayPalClientId(): string | null {
  return process.env.PAYPAL_CLIENT_ID || null;
}

function getPayPalSecret(): string | null {
  return process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET || null;
}

async function getPayPalAccessToken(sandboxMode: boolean): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = getPayPalSecret();

  if (!clientId || !clientSecret) {
    return null;
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      console.error("PayPal token error:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("PayPal token fetch error:", error);
    return null;
  }
}

export interface CreatePayPalOrderParams {
  amountCents: number;
  currency?: string;
  returnUrl: string;
  cancelUrl: string;
  sandboxMode?: boolean;
  description?: string;
  metadata?: Record<string, string>;
}

export async function createPayPalOrder(
  params: CreatePayPalOrderParams
): Promise<{ orderId: string; approvalUrl: string }> {
  const { amountCents, currency = "USD", returnUrl, cancelUrl, description, sandboxMode = true } = params;
  const accessToken = await getPayPalAccessToken(sandboxMode);
  if (!accessToken) {
    throw new Error("PayPal not configured or authentication failed");
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);
  const amountValue = (amountCents / 100).toFixed(2);

  try {
    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amountValue,
            },
            description: description || "Wallet Funding",
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
              brand_name: "Work Digital Credits",
              locale: "en-US",
              landing_page: "LOGIN",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: returnUrl,
              cancel_url: cancelUrl,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PayPal order creation error:", errorText);
      throw new Error("Failed to create PayPal order");
    }

    const data = await response.json();
    const approvalLink = data.links?.find((link: any) => link.rel === "payer-action");

    return {
      orderId: data.id,
      approvalUrl: approvalLink?.href || "",
    };
  } catch (error: any) {
    console.error("PayPal order creation error:", error);
    throw new Error(error.message || "Failed to create PayPal order");
  }
}

export async function capturePayPalOrder(
  orderId: string,
  sandboxMode: boolean = true
): Promise<PayPalCaptureResult> {
  const accessToken = await getPayPalAccessToken(sandboxMode);
  if (!accessToken) {
    return { success: false, error: "PayPal not configured or authentication failed" };
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);

  try {
    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PayPal capture error:", errorText);
      return { success: false, error: "Failed to capture PayPal payment" };
    }

    const data = await response.json();
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

    return {
      success: data.status === "COMPLETED",
      captureId: capture?.id,
      status: data.status,
    };
  } catch (error: any) {
    console.error("PayPal capture error:", error);
    return { success: false, error: error.message };
  }
}

export async function getPayPalOrderDetails(
  orderId: string,
  sandboxMode: boolean = true
): Promise<{ success: boolean; order?: any; error?: string }> {
  const accessToken = await getPayPalAccessToken(sandboxMode);
  if (!accessToken) {
    return { success: false, error: "PayPal not configured or authentication failed" };
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);

  try {
    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PayPal order details error:", errorText);
      return { success: false, error: "Failed to get PayPal order details" };
    }

    const data = await response.json();
    return { success: true, order: data };
  } catch (error: any) {
    console.error("PayPal order details error:", error);
    return { success: false, error: error.message };
  }
}

export interface PayPalVaultResult {
  success: boolean;
  vaultId?: string;
  email?: string;
  error?: string;
}

export async function createPayPalOrderWithVault(
  params: CreatePayPalOrderParams & { vaultPayment?: boolean }
): Promise<{ orderId: string; approvalUrl: string }> {
  const { amountCents, currency = "USD", returnUrl, cancelUrl, description, sandboxMode = true, vaultPayment = false } = params;
  const accessToken = await getPayPalAccessToken(sandboxMode);
  if (!accessToken) {
    throw new Error("PayPal not configured or authentication failed");
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);
  const amountValue = (amountCents / 100).toFixed(2);

  const paypalSource: any = {
    experience_context: {
      payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
      brand_name: "Work Digital Credits",
      locale: "en-US",
      landing_page: "LOGIN",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  if (vaultPayment) {
    paypalSource.attributes = {
      vault: {
        store_in_vault: "ON_SUCCESS",
        usage_type: "MERCHANT",
      },
    };
  }

  try {
    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amountValue,
            },
            description: description || "Wallet Funding",
          },
        ],
        payment_source: {
          paypal: paypalSource,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PayPal order creation error:", errorText);
      throw new Error("Failed to create PayPal order");
    }

    const data = await response.json();
    const approvalLink = data.links?.find((link: any) => link.rel === "payer-action");

    return {
      orderId: data.id,
      approvalUrl: approvalLink?.href || "",
    };
  } catch (error: any) {
    console.error("PayPal order creation error:", error);
    throw new Error(error.message || "Failed to create PayPal order");
  }
}

export async function capturePayPalOrderWithVault(
  orderId: string,
  sandboxMode: boolean = true
): Promise<PayPalCaptureResult & { vaultId?: string; payerEmail?: string }> {
  const accessToken = await getPayPalAccessToken(sandboxMode);
  if (!accessToken) {
    return { success: false, error: "PayPal not configured or authentication failed" };
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);

  try {
    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PayPal capture error:", errorText);
      return { success: false, error: "Failed to capture PayPal payment" };
    }

    const data = await response.json();
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    const paymentSource = data.payment_source?.paypal;
    const vaultId = paymentSource?.attributes?.vault?.id;
    const payerEmail = paymentSource?.email_address;

    return {
      success: data.status === "COMPLETED",
      captureId: capture?.id,
      status: data.status,
      vaultId,
      payerEmail,
    };
  } catch (error: any) {
    console.error("PayPal capture error:", error);
    return { success: false, error: error.message };
  }
}

export async function chargePayPalVault(
  vaultId: string,
  amountCents: number,
  currency: string = "USD",
  description: string,
  sandboxMode: boolean = true
): Promise<PayPalCaptureResult> {
  const accessToken = await getPayPalAccessToken(sandboxMode);
  if (!accessToken) {
    return { success: false, error: "PayPal not configured or authentication failed" };
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);
  const amountValue = (amountCents / 100).toFixed(2);

  try {
    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": `vault-charge-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amountValue,
            },
            description,
          },
        ],
        payment_source: {
          paypal: {
            vault_id: vaultId,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PayPal vault charge order error:", errorText);
      return { success: false, error: "Failed to create vault charge order" };
    }

    const orderData = await response.json();
    
    const captureResponse = await fetch(`${baseUrl}/v2/checkout/orders/${orderData.id}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error("PayPal vault capture error:", errorText);
      return { success: false, error: "Failed to capture vault payment" };
    }

    const captureData = await captureResponse.json();
    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];

    return {
      success: captureData.status === "COMPLETED",
      captureId: capture?.id,
      status: captureData.status,
    };
  } catch (error: any) {
    console.error("PayPal vault charge error:", error);
    return { success: false, error: error.message };
  }
}

export async function deletePayPalVault(
  vaultId: string,
  sandboxMode: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getPayPalAccessToken(sandboxMode);
  if (!accessToken) {
    return { success: false, error: "PayPal not configured or authentication failed" };
  }

  const baseUrl = getPayPalBaseUrl(sandboxMode);

  try {
    const response = await fetch(`${baseUrl}/v3/vault/payment-tokens/${vaultId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      console.error("PayPal vault delete error:", errorText);
      return { success: false, error: "Failed to delete PayPal vault" };
    }

    return { success: true };
  } catch (error: any) {
    console.error("PayPal vault delete error:", error);
    return { success: false, error: error.message };
  }
}

export function getPayPalMode(): "sandbox" | "live" | null {
  if (!isPayPalConfigured()) return null;
  return process.env.PAYPAL_SANDBOX_USERNAME ? "sandbox" : "live";
}
