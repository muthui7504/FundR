import { createHmac, timingSafeEqual } from "node:crypto";

type StripeCheckoutSession = {
  id: string;
  client_reference_id?: string | null;
  url?: string | null;
  status?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string, string>;
};

async function stripeRequest<T>(
  secretKey: string,
  path: string,
  options: { method?: "GET" | "POST"; form?: URLSearchParams } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(options.form
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      body: options.form?.toString(),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(
        payload.error?.message ??
          `Stripe request failed with status ${response.status}.`,
      );
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyStripeSecretKey(secretKey: string) {
  await stripeRequest<{ id: string }>(secretKey, "/account");
}

export async function createStripeCheckoutSession(input: {
  secretKey: string;
  paymentId: string;
  campaignId: string;
  campaignName: string;
  planCode: string;
  planName: string;
  amountKes: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const form = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.paymentId,
    "line_items[0][price_data][currency]": "kes",
    "line_items[0][price_data][unit_amount]": String(input.amountKes * 100),
    "line_items[0][price_data][product_data][name]": `${input.planName} subscription`,
    "line_items[0][price_data][product_data][description]": input.campaignName,
    "line_items[0][quantity]": "1",
    "metadata[paymentId]": input.paymentId,
    "metadata[campaignId]": input.campaignId,
    "metadata[planCode]": input.planCode,
  });
  return stripeRequest<StripeCheckoutSession>(
    input.secretKey,
    "/checkout/sessions",
    {
      method: "POST",
      form,
    },
  );
}

export async function getStripeCheckoutSession(
  secretKey: string,
  sessionId: string,
) {
  return stripeRequest<StripeCheckoutSession>(
    secretKey,
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  now = Date.now(),
) {
  const fields = signatureHeader
    .split(",")
    .map((part) => part.trim().split("=", 2));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields
    .filter(([key]) => key === "v1")
    .map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp))
    return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest();
  return signatures.some((signature) => {
    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    const provided = Buffer.from(signature, "hex");
    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  });
}

export type { StripeCheckoutSession };
