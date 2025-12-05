import Stripe from "stripe";

let stripeClient: Stripe | null = null;
let connectionSettings: any = null;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    return null;
  }

  const connectorName = "stripe";
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  try {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set("include_secrets", "true");
    url.searchParams.set("connector_names", connectorName);
    url.searchParams.set("environment", targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    });

    const data = await response.json();
    connectionSettings = data.items?.[0];

    if (!connectionSettings?.settings?.publishable || !connectionSettings?.settings?.secret) {
      return null;
    }

    return {
      publishableKey: connectionSettings.settings.publishable,
      secretKey: connectionSettings.settings.secret,
    };
  } catch (error) {
    console.error("Failed to get Stripe credentials:", error);
    return null;
  }
}

export async function getStripeClient(): Promise<Stripe | null> {
  const credentials = await getCredentials();
  if (!credentials) {
    return null;
  }

  return new Stripe(credentials.secretKey, {
    apiVersion: "2025-08-27.basil" as any,
  });
}

export async function getStripePublishableKey(): Promise<string | null> {
  const credentials = await getCredentials();
  return credentials?.publishableKey || null;
}

export async function isStripeConfigured(): Promise<boolean> {
  const credentials = await getCredentials();
  return !!credentials;
}

export interface StripePaymentResult {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  error?: string;
  requiresAction?: boolean;
}

export interface StripeCustomerResult {
  success: boolean;
  customerId?: string;
  error?: string;
}

export async function createStripeCustomer(
  email: string,
  name?: string,
  metadata?: Record<string, string>
): Promise<StripeCustomerResult> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata,
    });
    return { success: true, customerId: customer.id };
  } catch (error: any) {
    console.error("Stripe create customer error:", error);
    return { success: false, error: error.message };
  }
}

export async function createStripePaymentIntent(
  amountCents: number,
  currency: string = "usd",
  customerId?: string,
  paymentMethodId?: string,
  metadata?: Record<string, string>
): Promise<StripePaymentResult> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata,
    };

    if (customerId) {
      paymentIntentParams.customer = customerId;
    }

    if (paymentMethodId) {
      paymentIntentParams.payment_method = paymentMethodId;
      paymentIntentParams.confirm = true;
      paymentIntentParams.return_url = `${process.env.REPLIT_DOMAINS?.split(",")[0] || "http://localhost:5000"}/wallet?payment=success`;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret || undefined,
      requiresAction: paymentIntent.status === "requires_action",
    };
  } catch (error: any) {
    console.error("Stripe payment intent error:", error);
    return { success: false, error: error.message };
  }
}

export async function confirmStripePaymentIntent(
  paymentIntentId: string,
  paymentMethodId: string
): Promise<StripePaymentResult> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
      return_url: `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}/wallet?payment=success`,
    });

    return {
      success: paymentIntent.status === "succeeded",
      paymentIntentId: paymentIntent.id,
      requiresAction: paymentIntent.status === "requires_action",
    };
  } catch (error: any) {
    console.error("Stripe confirm payment error:", error);
    return { success: false, error: error.message };
  }
}

export async function attachPaymentMethodToCustomer(
  paymentMethodId: string,
  customerId: string
): Promise<{ success: boolean; error?: string }> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
    return { success: true };
  } catch (error: any) {
    console.error("Stripe attach payment method error:", error);
    return { success: false, error: error.message };
  }
}

export async function getStripePaymentMethod(
  paymentMethodId: string
): Promise<{ success: boolean; paymentMethod?: Stripe.PaymentMethod; error?: string }> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return { success: true, paymentMethod };
  } catch (error: any) {
    console.error("Stripe get payment method error:", error);
    return { success: false, error: error.message };
  }
}

export async function createStripeSetupIntent(
  customerId: string
): Promise<{ success: boolean; clientSecret?: string; setupIntentId?: string; error?: string }> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
    });

    return {
      success: true,
      clientSecret: setupIntent.client_secret || undefined,
      setupIntentId: setupIntent.id,
    };
  } catch (error: any) {
    console.error("Stripe setup intent error:", error);
    return { success: false, error: error.message };
  }
}

export async function chargePaymentMethod(
  amountCents: number,
  paymentMethodId: string,
  customerId: string,
  description: string
): Promise<StripePaymentResult> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description,
    });

    return {
      success: paymentIntent.status === "succeeded",
      paymentIntentId: paymentIntent.id,
      requiresAction: paymentIntent.status === "requires_action",
    };
  } catch (error: any) {
    console.error("Stripe charge payment method error:", error);
    return { success: false, error: error.message };
  }
}

export interface CheckoutSessionParams {
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

export async function createStripeCheckoutSession(
  params: CheckoutSessionParams
): Promise<CheckoutSessionResult> {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: params.currency,
            product_data: {
              name: "Wallet Funding",
              description: `Add ${(params.amountCents / 100).toFixed(2)} ${params.currency.toUpperCase()} to your wallet`,
            },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    if (!session.url) {
      throw new Error("Stripe checkout session created but no URL returned");
    }

    return {
      id: session.id,
      url: session.url,
    };
  } catch (error: any) {
    console.error("Stripe checkout session error:", error);
    throw new Error(error.message || "Failed to create checkout session");
  }
}
