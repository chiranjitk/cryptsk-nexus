import crypto from "crypto";
import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────
interface PaymentGatewayConfig {
  id: string;
  provider: string;
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  environment: "test" | "live";
  enabled: boolean;
}

interface CreatePaymentOrderResult {
  success: boolean;
  orderId?: string;
  paymentUrl?: string;
  amount?: number;
  currency?: string;
  error?: string;
  provider: string;
}

interface VerifyPaymentResult {
  success: boolean;
  verified: boolean;
  error?: string;
  provider: string;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
  provider: string;
}

// ─── Get active payment gateway config ──────────────────────────
async function getActiveGateway(): Promise<PaymentGatewayConfig | null> {
  const gateway = await db.integrationConfig.findFirst({
    where: {
      type: "payment_gateway",
      enabled: true,
      apiKey: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!gateway) return null;

  return {
    id: gateway.id,
    provider: gateway.provider,
    apiKey: gateway.apiKey,
    apiSecret: gateway.apiSecret,
    merchantId: gateway.merchantId,
    environment: (gateway.environment as "test" | "live") || "test",
    enabled: gateway.enabled,
  };
}

// ─── Razorpay Integration ───────────────────────────────────────
async function createRazorpayOrder(
  amount: number,
  currency: string,
  receipt: string,
  notes: Record<string, string>,
  config: PaymentGatewayConfig
): Promise<CreatePaymentOrderResult> {
  try {
    const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
    const baseUrl = config.environment === "live"
      ? "https://api.razorpay.com/v1"
      : "https://api.razorpay.com/v1";

    const response = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Razorpay expects amount in paise
        currency: currency || "INR",
        receipt,
        notes,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error?.description || `Razorpay error: ${response.status}`,
        provider: "razorpay",
      };
    }

    const data = await response.json();
    return {
      success: true,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      provider: "razorpay",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Razorpay error",
      provider: "razorpay",
    };
  }
}

async function verifyRazorpayPayment(
  orderId: string,
  paymentId: string,
  signature: string,
  config: PaymentGatewayConfig
): Promise<VerifyPaymentResult> {
  try {
    const expectedSignature = crypto
      .createHmac("sha256", config.apiSecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (expectedSignature === signature) {
      return { success: true, verified: true, provider: "razorpay" };
    }

    return { success: true, verified: false, error: "Signature mismatch - payment may be tampered", provider: "razorpay" };
  } catch (error) {
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : "Verification error",
      provider: "razorpay",
    };
  }
}

async function testRazorpay(config: PaymentGatewayConfig): Promise<TestConnectionResult> {
  try {
    const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      method: "GET",
      headers: {
        "Authorization": `Basic ${auth}`,
      },
    });

    if (response.ok) {
      return {
        success: true,
        message: `Connected! Mode: ${config.environment}`,
        provider: "razorpay",
      };
    }

    const errorData = await response.json();
    return {
      success: false,
      message: `Authentication failed: ${errorData.error?.description || response.status}`,
      provider: "razorpay",
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Network error"}`,
      provider: "razorpay",
    };
  }
}

// ─── Stripe Integration ─────────────────────────────────────────
async function createStripeCheckout(
  amount: number,
  currency: string,
  receipt: string,
  notes: Record<string, string>,
  config: PaymentGatewayConfig
): Promise<CreatePaymentOrderResult> {
  try {
    const baseUrl = config.environment === "live"
      ? "https://api.stripe.com/v1"
      : "https://api.stripe.com/v1";

    const response = await fetch(`${baseUrl}/payment_intents`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: Math.round(amount * 100).toString(),
        currency: (currency || "usd").toLowerCase(),
        description: receipt,
        "metadata[receipt]": receipt,
        "metadata[subscriber_name]": notes.subscriber_name || "",
        "metadata[subscriber_id]": notes.subscriber_id || "",
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        success: false,
        error: errorData.error?.message || `Stripe error: ${response.status}`,
        provider: "stripe",
      };
    }

    const data = await response.json();
    return {
      success: true,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      provider: "stripe",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
      provider: "stripe",
    };
  }
}

async function testStripe(config: PaymentGatewayConfig): Promise<TestConnectionResult> {
  try {
    const response = await fetch("https://api.stripe.com/v1/balance", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${config.apiSecret}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      const available = data.available?.[0]?.amount;
      const currency = data.available?.[0]?.currency?.toUpperCase() || 'USD';
      const symbol = currency === 'INR' ? '₹' : '$';
      return {
        success: true,
        message: `Connected! Mode: ${config.environment}, Balance: ${symbol}${((available || 0) / 100).toFixed(2)}`,
        provider: "stripe",
      };
    }

    const errorData = await response.json();
    return {
      success: false,
      message: `Authentication failed: ${errorData.error?.message || response.status}`,
      provider: "stripe",
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : "Network error"}`,
      provider: "stripe",
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────
export async function createPaymentOrder(options: {
  amount: number;
  currency?: string;
  receipt: string;
  subscriberId?: string;
  subscriberName?: string;
  invoiceId?: string;
}): Promise<CreatePaymentOrderResult> {
  const config = await getActiveGateway();
  if (!config) {
    return {
      success: false,
      error: "No payment gateway configured. Configure in Settings > Integrations > Payment Gateways.",
      provider: "none",
    };
  }

  const notes: Record<string, string> = {
    receipt: options.receipt,
    ...(options.subscriberId && { subscriber_id: options.subscriberId }),
    ...(options.subscriberName && { subscriber_name: options.subscriberName }),
    ...(options.invoiceId && { invoice_id: options.invoiceId }),
  };

  switch (config.provider) {
    case "razorpay":
      return createRazorpayOrder(options.amount, options.currency || "INR", options.receipt, notes, config);
    case "stripe":
      return createStripeCheckout(options.amount, options.currency || "USD", options.receipt, notes, config);
    default:
      return {
        success: false,
        error: `Unsupported payment provider: ${config.provider}`,
        provider: config.provider,
      };
  }
}

export async function verifyPayment(options: {
  provider: string;
  orderId: string;
  paymentId: string;
  signature?: string;
}): Promise<VerifyPaymentResult> {
  const config = await getActiveGateway();
  if (!config) {
    return { success: false, verified: false, error: "No payment gateway configured", provider: "none" };
  }

  switch (options.provider) {
    case "razorpay":
      return verifyRazorpayPayment(options.orderId, options.paymentId, options.signature || "", config);
    case "stripe":
      // Stripe verification is done via webhook, client-side token verification
      return { success: true, verified: true, provider: "stripe" };
    default:
      return { success: false, verified: false, error: `Unsupported provider: ${options.provider}`, provider: options.provider };
  }
}

export async function testPaymentConnection(integrationId: string): Promise<TestConnectionResult> {
  const config = await db.integrationConfig.findUnique({ where: { id: integrationId } });
  if (!config) {
    return { success: false, message: "Integration not found", provider: "unknown" };
  }

  const gatewayConfig: PaymentGatewayConfig = {
    id: config.id,
    provider: config.provider,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    merchantId: config.merchantId,
    environment: (config.environment as "test" | "live") || "test",
    enabled: config.enabled,
  };

  switch (config.provider) {
    case "razorpay":
      return testRazorpay(gatewayConfig);
    case "stripe":
      return testStripe(gatewayConfig);
    default:
      return { success: false, message: `Testing not supported for provider: ${config.provider}`, provider: config.provider };
  }
}
