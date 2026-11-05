import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, PageHeader, Panel, StatusBadge, inputCls } from "@/components/kit";
import { api } from "@/services/api";
import type { PlatformPaymentConfiguration } from "@/types";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/platform-admin/payment-configuration")({
  head: () =>
    meta("Payment configuration", "Configure how campaign subscriptions are paid on Fundraise."),
  component: PaymentConfiguration,
});

function PaymentConfiguration() {
  const [configuration, setConfiguration] = useState<PlatformPaymentConfiguration | null>(null);
  const [provider, setProvider] = useState<"MPESA" | "STRIPE">("MPESA");
  const [mpesaConsumerKey, setMpesaConsumerKey] = useState("");
  const [mpesaConsumerSecret, setMpesaConsumerSecret] = useState("");
  const [mpesaShortcode, setMpesaShortcode] = useState("");
  const [mpesaPasskey, setMpesaPasskey] = useState("");
  const [mpesaType, setMpesaType] = useState<"PAYBILL" | "TILL">("PAYBILL");
  const [mpesaEnvironment, setMpesaEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void api.platform
      .paymentConfiguration()
      .then((result) => {
        if (!active) return;
        setConfiguration(result);
        setProvider(result.provider);
        setMpesaShortcode(result.mpesa.shortcode);
        setMpesaType(result.mpesa.type);
        setMpesaEnvironment(result.mpesa.environment);
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error ? cause.message : "Unable to load payment configuration.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await api.platform.savePaymentConfiguration({
        provider,
        mpesaConsumerKey: mpesaConsumerKey.trim() || undefined,
        mpesaConsumerSecret: mpesaConsumerSecret || undefined,
        mpesaShortcode: mpesaShortcode.trim() || undefined,
        mpesaPasskey: mpesaPasskey || undefined,
        mpesaType,
        mpesaEnvironment,
        stripeSecretKey: stripeSecretKey.trim() || undefined,
        stripeWebhookSecret: stripeWebhookSecret.trim() || undefined,
      });
      setConfiguration(updated);
      setProvider(updated.provider);
      setMpesaConsumerKey("");
      setMpesaConsumerSecret("");
      setMpesaPasskey("");
      setStripeSecretKey("");
      setStripeWebhookSecret("");
      toast.success("Payment configuration saved", {
        description: `${updated.provider === "MPESA" ? "M-Pesa" : "Stripe"} is now selected for campaign subscriptions.`,
      });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save payment configuration.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading payment configuration…
      </p>
    );
  if (loadError)
    return (
      <Panel className="p-5">
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </Panel>
    );

  return (
    <>
      <PageHeader
        title="Payment configuration"
        description="Select and configure the payment provider used for campaign subscriptions."
      />
      <form className="grid max-w-3xl gap-6" onSubmit={(event) => void save(event)}>
        <Panel className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Subscription payment method</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                New campaign subscription payments will use this provider.
              </p>
            </div>
            {configuration && (
              <StatusBadge
                status={
                  provider === "MPESA"
                    ? configuration.mpesa.configured
                      ? "CONFIGURED"
                      : "NOT_CONFIGURED"
                    : configuration.stripe.configured
                      ? "CONFIGURED"
                      : "NOT_CONFIGURED"
                }
              />
            )}
          </div>
          <Field label="Payment provider" htmlFor="subscription-payment-provider">
            <select
              id="subscription-payment-provider"
              className={inputCls}
              value={provider}
              onChange={(event) => {
                if (event.target.value === "MPESA" || event.target.value === "STRIPE")
                  setProvider(event.target.value);
              }}
            >
              <option value="MPESA">M-Pesa (Daraja)</option>
              <option value="STRIPE">Card payments (Stripe)</option>
            </select>
          </Field>
        </Panel>

        <Panel className="space-y-4 p-5">
          <div>
            <h2 className="font-semibold">M-Pesa (Daraja) credentials</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Credentials are encrypted before storage. Leave secret fields blank to keep saved
              credentials.
            </p>
          </div>
          {configuration?.mpesa.configured && (
            <p className="text-sm text-success">
              M-Pesa credentials are configured · shortcode {configuration.mpesa.shortcode}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Consumer key" htmlFor="platform-mpesa-key">
              <input
                id="platform-mpesa-key"
                className={inputCls}
                autoComplete="off"
                placeholder={configuration?.mpesa.configured ? "••••••••••••••••" : ""}
                value={mpesaConsumerKey}
                onChange={(event) => setMpesaConsumerKey(event.target.value)}
              />
            </Field>
            <Field label="Consumer secret" htmlFor="platform-mpesa-secret">
              <input
                id="platform-mpesa-secret"
                type="password"
                className={inputCls}
                autoComplete="new-password"
                placeholder={configuration?.mpesa.configured ? "••••••••••••••••" : ""}
                value={mpesaConsumerSecret}
                onChange={(event) => setMpesaConsumerSecret(event.target.value)}
              />
            </Field>
            <Field label="Shortcode" htmlFor="platform-mpesa-shortcode">
              <input
                id="platform-mpesa-shortcode"
                className={inputCls}
                inputMode="numeric"
                value={mpesaShortcode}
                onChange={(event) => setMpesaShortcode(event.target.value)}
              />
            </Field>
            <Field label="Passkey" htmlFor="platform-mpesa-passkey">
              <input
                id="platform-mpesa-passkey"
                type="password"
                className={inputCls}
                autoComplete="new-password"
                placeholder={configuration?.mpesa.configured ? "••••••••••••••••" : ""}
                value={mpesaPasskey}
                onChange={(event) => setMpesaPasskey(event.target.value)}
              />
            </Field>
            <Field label="Account type" htmlFor="platform-mpesa-type">
              <select
                id="platform-mpesa-type"
                className={inputCls}
                value={mpesaType}
                onChange={(event) =>
                  setMpesaType(event.target.value === "TILL" ? "TILL" : "PAYBILL")
                }
              >
                <option value="PAYBILL">Paybill</option>
                <option value="TILL">Buy Goods / Till</option>
              </select>
            </Field>
            <Field label="Environment" htmlFor="platform-mpesa-environment">
              <select
                id="platform-mpesa-environment"
                className={inputCls}
                value={mpesaEnvironment}
                onChange={(event) =>
                  setMpesaEnvironment(
                    event.target.value === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
                  )
                }
              >
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </Field>
          </div>
          <div className="rounded-xl bg-muted p-3 text-sm">
            <p className="font-medium">Subscription callback endpoint</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {configuration?.mpesa.callbackUrl ||
                "Set DARAJA_CALLBACK_URL or PLATFORM_DARAJA_CALLBACK_URL on the API server."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This server endpoint is derived from the API callback configuration and is not edited
              here.
            </p>
          </div>
        </Panel>

        <Panel className="space-y-4 p-5">
          <div>
            <h2 className="font-semibold">Card payments (Stripe)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Card checkout uses Stripe Checkout and charges campaign plans in KSh. Stripe keys are
              encrypted and never returned to the browser.
            </p>
          </div>
          {configuration?.stripe.configured && (
            <p className="text-sm text-success">
              Stripe secret key and webhook signing secret are configured.
            </p>
          )}
          <Field
            label="Stripe secret key"
            htmlFor="platform-stripe-secret"
            hint="Use a restricted or standard key from your Stripe dashboard. Leave blank to keep the current key."
          >
            <input
              id="platform-stripe-secret"
              type="password"
              className={inputCls}
              autoComplete="new-password"
              placeholder={configuration?.stripe.configured ? "••••••••••••••••" : "sk_test_…"}
              value={stripeSecretKey}
              onChange={(event) => setStripeSecretKey(event.target.value)}
            />
          </Field>
          <Field
            label="Webhook signing secret"
            htmlFor="platform-stripe-webhook-secret"
            hint="Create a webhook for checkout.session.completed and checkout.session.expired."
          >
            <input
              id="platform-stripe-webhook-secret"
              type="password"
              className={inputCls}
              autoComplete="new-password"
              placeholder={configuration?.stripe.configured ? "••••••••••••••••" : "whsec_…"}
              value={stripeWebhookSecret}
              onChange={(event) => setStripeWebhookSecret(event.target.value)}
            />
          </Field>
          <div className="rounded-xl bg-muted p-3 text-sm">
            <p className="font-medium">Stripe webhook endpoint</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {configuration?.stripe.webhookEndpoint}
            </p>
          </div>
        </Panel>

        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "Verifying and saving…" : "Save payment configuration"}
          </Button>
        </div>
      </form>
    </>
  );
}
