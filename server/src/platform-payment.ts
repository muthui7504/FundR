import type { DarajaCredentials } from "./daraja-client";
import { store } from "./api-context";
import { decryptSecretPayload, encryptSecretPayload } from "./mpesa-crypto";

export type SubscriptionPaymentProvider = "MPESA" | "STRIPE";

export type PlatformPaymentSecrets = {
  mpesa?: DarajaCredentials;
  stripe?: {
    secretKey: string;
    webhookSecret: string;
  };
};

export type PublicPlatformPaymentConfiguration = {
  provider: SubscriptionPaymentProvider;
  mpesa: {
    configured: boolean;
    shortcode: string;
    type: "PAYBILL" | "TILL";
    environment: "SANDBOX" | "PRODUCTION";
    callbackUrl: string;
  };
  stripe: {
    configured: boolean;
    webhookEndpoint: string;
  };
};

function environmentDarajaCredentials(): DarajaCredentials | undefined {
  const {
    PLATFORM_DARAJA_CONSUMER_KEY,
    PLATFORM_DARAJA_CONSUMER_SECRET,
    PLATFORM_DARAJA_SHORTCODE,
    PLATFORM_DARAJA_PASSKEY,
  } = process.env;
  if (
    !PLATFORM_DARAJA_CONSUMER_KEY ||
    !PLATFORM_DARAJA_CONSUMER_SECRET ||
    !PLATFORM_DARAJA_SHORTCODE ||
    !PLATFORM_DARAJA_PASSKEY
  )
    return undefined;
  return {
    consumerKey: PLATFORM_DARAJA_CONSUMER_KEY,
    consumerSecret: PLATFORM_DARAJA_CONSUMER_SECRET,
    shortcode: PLATFORM_DARAJA_SHORTCODE,
    passkey: PLATFORM_DARAJA_PASSKEY,
    type: process.env.PLATFORM_DARAJA_TYPE === "TILL" ? "TILL" : "PAYBILL",
    environment:
      process.env.PLATFORM_DARAJA_ENVIRONMENT === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX",
  };
}

function environmentSubscriptionCallbackUrl() {
  const configured =
    process.env.PLATFORM_DARAJA_CALLBACK_URL || process.env.DARAJA_CALLBACK_URL;
  return configuredSubscriptionCallbackUrl(configured);
}

function configuredSubscriptionCallbackUrl(configured: string | undefined) {
  if (!configured) return "";
  const url = new URL(configured);
  url.pathname = "/api/subscriptions/mpesa/callback";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function getPlatformMpesaCallbackUrl() {
  return configuredSubscriptionCallbackUrl(
    store.platformMpesaCallbackUrl ||
      process.env.PLATFORM_DARAJA_CALLBACK_URL ||
      process.env.DARAJA_CALLBACK_URL,
  );
}

export function getPlatformPaymentSecrets(): PlatformPaymentSecrets {
  const saved = store.platformPaymentCredentialVault
    ? decryptSecretPayload<PlatformPaymentSecrets>(
        store.platformPaymentCredentialVault,
      )
    : {};
  const mpesa = environmentDarajaCredentials();
  const stripeSecretKey = process.env.PLATFORM_STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.PLATFORM_STRIPE_WEBHOOK_SECRET;
  const secrets: PlatformPaymentSecrets = {};
  const mpesaCredentials = saved.mpesa ?? mpesa;
  if (mpesaCredentials) secrets.mpesa = mpesaCredentials;
  if (saved.stripe) secrets.stripe = saved.stripe;
  else if (stripeSecretKey && stripeWebhookSecret)
    secrets.stripe = {
      secretKey: stripeSecretKey,
      webhookSecret: stripeWebhookSecret,
    };
  return secrets;
}

export function getPlatformPaymentProvider(): SubscriptionPaymentProvider {
  return (
    store.platformPaymentProvider ??
    (process.env.PLATFORM_STRIPE_SECRET_KEY &&
    process.env.PLATFORM_STRIPE_WEBHOOK_SECRET
      ? "STRIPE"
      : "MPESA")
  );
}

export function getAvailableSubscriptionPaymentProviders(): SubscriptionPaymentProvider[] {
  const secrets = getPlatformPaymentSecrets();
  const providers: SubscriptionPaymentProvider[] = [];
  if (secrets.mpesa && getPlatformMpesaCallbackUrl()) providers.push("MPESA");
  if (secrets.stripe) providers.push("STRIPE");
  return providers;
}

export function getPublicPlatformPaymentConfiguration(): PublicPlatformPaymentConfiguration {
  const secrets = getPlatformPaymentSecrets();
  const mpesa = secrets.mpesa;
  const stripe = secrets.stripe;
  return {
    provider: getPlatformPaymentProvider(),
    mpesa: {
      configured: Boolean(mpesa),
      shortcode: mpesa?.shortcode ?? "",
      type: mpesa?.type ?? "PAYBILL",
      environment: mpesa?.environment ?? "SANDBOX",
      callbackUrl: getPlatformMpesaCallbackUrl(),
    },
    stripe: {
      configured: Boolean(stripe),
      webhookEndpoint: "/api/subscriptions/stripe/webhook",
    },
  };
}

export function savePlatformPaymentConfiguration(input: {
  provider: SubscriptionPaymentProvider;
  secrets: PlatformPaymentSecrets;
  mpesaCallbackUrl: string;
}) {
  store.platformPaymentProvider = input.provider;
  store.platformPaymentCredentialVault = encryptSecretPayload(input.secrets);
  store.platformMpesaCallbackUrl = input.mpesaCallbackUrl;
}

export function environmentDarajaFallback() {
  return environmentDarajaCredentials();
}
