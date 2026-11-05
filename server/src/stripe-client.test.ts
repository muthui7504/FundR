import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createStripeCheckoutSession,
  verifyStripeWebhookSignature,
} from "./stripe-client";

test("Stripe webhook signatures validate the raw payload and reject stale timestamps", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  assert.equal(
    verifyStripeWebhookSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      secret,
    ),
    true,
  );
  assert.equal(
    verifyStripeWebhookSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      "wrong-secret",
    ),
    false,
  );
  assert.equal(
    verifyStripeWebhookSignature(
      payload,
      `t=${timestamp - 301},v1=${signature}`,
      secret,
    ),
    false,
  );
  assert.equal(verifyStripeWebhookSignature(payload, "invalid", secret), false);
});

test("Stripe checkout sessions charge the configured KSh amount in card mode", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body);
    return new Response(
      JSON.stringify({
        id: "cs_test_123",
        url: "https://checkout.stripe.test",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const session = await createStripeCheckoutSession({
      secretKey: "sk_test_example",
      paymentId: "payment-123",
      campaignId: "campaign-456",
      campaignName: "Roofing",
      planCode: "BASIC",
      planName: "Basic",
      amountKes: 1000,
      successUrl: "https://fundraise.test/success",
      cancelUrl: "https://fundraise.test/cancel",
    });

    const form = new URLSearchParams(requestBody);
    assert.equal(requestUrl, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(form.get("mode"), "payment");
    assert.equal(form.get("payment_method_types[0]"), "card");
    assert.equal(form.get("line_items[0][price_data][currency]"), "kes");
    assert.equal(form.get("line_items[0][price_data][unit_amount]"), "100000");
    assert.equal(form.get("metadata[paymentId]"), "payment-123");
    assert.equal(session.id, "cs_test_123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
