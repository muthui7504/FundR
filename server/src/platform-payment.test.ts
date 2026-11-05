import assert from "node:assert/strict";
import test from "node:test";
import { sessions, store } from "./api-context";
import { handleMembershipRoutes } from "./membership-routes";
import { getAvailableSubscriptionPaymentProviders } from "./platform-payment";

test("available subscription methods include configured M-Pesa when Stripe is unavailable", () => {
  const env = {
    consumerKey: process.env.PLATFORM_DARAJA_CONSUMER_KEY,
    consumerSecret: process.env.PLATFORM_DARAJA_CONSUMER_SECRET,
    shortcode: process.env.PLATFORM_DARAJA_SHORTCODE,
    passkey: process.env.PLATFORM_DARAJA_PASSKEY,
    callbackUrl: process.env.DARAJA_CALLBACK_URL,
    platformCallbackUrl: process.env.PLATFORM_DARAJA_CALLBACK_URL,
    stripeSecretKey: process.env.PLATFORM_STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.PLATFORM_STRIPE_WEBHOOK_SECRET,
  };
  const savedProvider = store.platformPaymentProvider;
  const savedVault = store.platformPaymentCredentialVault;
  const savedCallbackUrl = store.platformMpesaCallbackUrl;

  try {
    process.env.PLATFORM_DARAJA_CONSUMER_KEY = "consumer-key";
    process.env.PLATFORM_DARAJA_CONSUMER_SECRET = "consumer-secret";
    process.env.PLATFORM_DARAJA_SHORTCODE = "123456";
    process.env.PLATFORM_DARAJA_PASSKEY = "passkey";
    process.env.DARAJA_CALLBACK_URL =
      "https://payments.example.test/api/contributions/mpesa/callback";
    delete process.env.PLATFORM_DARAJA_CALLBACK_URL;
    delete process.env.PLATFORM_STRIPE_SECRET_KEY;
    delete process.env.PLATFORM_STRIPE_WEBHOOK_SECRET;
    store.platformPaymentProvider = "STRIPE";
    store.platformPaymentCredentialVault = undefined;
    store.platformMpesaCallbackUrl = undefined;

    assert.deepEqual(getAvailableSubscriptionPaymentProviders(), ["MPESA"]);
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("PLATFORM_DARAJA_CONSUMER_KEY", env.consumerKey);
    restore("PLATFORM_DARAJA_CONSUMER_SECRET", env.consumerSecret);
    restore("PLATFORM_DARAJA_SHORTCODE", env.shortcode);
    restore("PLATFORM_DARAJA_PASSKEY", env.passkey);
    restore("DARAJA_CALLBACK_URL", env.callbackUrl);
    restore("PLATFORM_DARAJA_CALLBACK_URL", env.platformCallbackUrl);
    restore("PLATFORM_STRIPE_SECRET_KEY", env.stripeSecretKey);
    restore("PLATFORM_STRIPE_WEBHOOK_SECRET", env.stripeWebhookSecret);
    store.platformPaymentProvider = savedProvider;
    store.platformPaymentCredentialVault = savedVault;
    store.platformMpesaCallbackUrl = savedCallbackUrl;
  }
});

test("organisation staff and administrators can access subscription payment availability", async () => {
  const userId = "test-subscription-staff";
  const sessionId = "test-subscription-staff-session";
  const adminUserId = "test-subscription-admin";
  const adminSessionId = "test-subscription-admin-session";
  const originalUsers = store.users;
  const originalSession = sessions.get(sessionId);
  const originalAdminSession = sessions.get(adminSessionId);
  store.users = [
    ...originalUsers,
    {
      id: userId,
      email: "subscription-staff@example.test",
      firstName: "Subscription",
      lastName: "Staff",
      role: "ORGANISATION_STAFF",
      password: "",
      orgId: "test-organisation",
    },
    {
      id: adminUserId,
      email: "subscription-admin@example.test",
      firstName: "Subscription",
      lastName: "Admin",
      role: "ORGANISATION_ADMIN",
      password: "",
      orgId: "test-organisation",
    },
  ];
  sessions.set(sessionId, {
    userId,
    expiresAt: Date.now() + 60_000,
  });
  sessions.set(adminSessionId, {
    userId: adminUserId,
    expiresAt: Date.now() + 60_000,
  });

  try {
    const makeContext = (cookieSessionId: string) => {
      const request = new Request(
        "http://localhost/api/subscriptions/payment-method",
        { headers: { cookie: `fundraise_session=${cookieSessionId}` } },
      );
      return {
        request,
        url: new URL(request.url),
        path: "subscriptions/payment-method",
        parts: ["subscriptions", "payment-method"],
        method: "GET",
        setCookie: () => "",
      };
    };

    assert.equal((await handleMembershipRoutes(makeContext(sessionId)))?.status, 200);
    assert.equal(
      (await handleMembershipRoutes(makeContext(adminSessionId)))?.status,
      200,
    );
  } finally {
    store.users = originalUsers;
    if (originalSession) sessions.set(sessionId, originalSession);
    else sessions.delete(sessionId);
    if (originalAdminSession) sessions.set(adminSessionId, originalAdminSession);
    else sessions.delete(adminSessionId);
  }
});
