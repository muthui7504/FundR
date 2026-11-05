import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, PageHeader, Panel, inputCls } from "@/components/kit";
import { CampaignForm, type CampaignInput } from "@/components/campaigns/CampaignForm";
import { useDemo } from "@/context/DemoStore";
import { meta } from "@/utils/meta";
import { api } from "@/services/api";
import type { Plan } from "@/types";
import { formatKES } from "@/utils/format";

export const Route = createFileRoute("/organisation/campaigns/new")({
  head: () => meta("Create campaign", "Set up a new fundraising campaign with a target and dates."),
  component: NewCampaign,
});

function NewCampaign() {
  const nav = useNavigate();
  const { plans, setCampaigns } = useDemo();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingInput, setPendingInput] = useState<CampaignInput | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [upgradePhone, setUpgradePhone] = useState("");
  const [paymentProvider, setPaymentProvider] = useState<"MPESA" | "STRIPE" | null>(null);
  const [availablePaymentProviders, setAvailablePaymentProviders] = useState<
    ("MPESA" | "STRIPE")[]
  >([]);
  const [paymentProviderLoading, setPaymentProviderLoading] = useState(true);
  const [paymentProviderError, setPaymentProviderError] = useState("");
  const loadPaymentMethods = useCallback(async (isActive: () => boolean = () => true) => {
    setPaymentProviderLoading(true);
    setPaymentProviderError("");
    try {
      const result = await api.subscriptions.paymentMethod();
      if (!isActive()) return;
      const available = result.availableProviders ?? (result.configured ? [result.provider] : []);
      setPaymentProvider(result.provider);
      setAvailablePaymentProviders(available);
      if (!available.includes(result.provider) && available.length > 0)
        setPaymentProvider(available[0]);
    } catch (cause) {
      if (isActive())
        setPaymentProviderError(
          cause instanceof Error ? cause.message : "Unable to load payment methods.",
        );
    } finally {
      if (isActive()) setPaymentProviderLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void loadPaymentMethods(() => active);
    return () => {
      active = false;
    };
  }, [loadPaymentMethods]);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanCode);
  const selectedPlanIsPaid =
    selectedPlan?.price !== null &&
    selectedPlan?.price !== undefined &&
    selectedPlan.price > 0;
  const createCampaign = async (v: CampaignInput, plan: Plan, phone: string) => {
    try {
      const created = await api.campaigns.create({ ...v, status: "ACTIVE" });
      setCampaigns((cs) => [...cs, created]);
      try {
        const payment = await api.campaigns.upgradeMembership(created.id, {
          planCode: plan.id,
          phone,
          paymentProvider: plan.price && plan.price > 0 ? paymentProvider ?? undefined : undefined,
        });
        if (payment.checkoutUrl) {
          window.location.assign(payment.checkoutUrl);
          return;
        }
        toast.success("Campaign created", { description: payment.message });
      } catch (error) {
        toast.error("Campaign created without an active subscription", {
          description:
            error instanceof Error
              ? error.message
              : "The campaign subscription could not be started.",
        });
      }
      nav({ to: "/organisation/campaigns/$campaignId", params: { campaignId: created.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create campaign.");
    }
  };
  const openPlanDialog = (v: CampaignInput) => {
    setPendingInput(v);
    setSelectedPlanCode(
      plans.find((plan) => plan.price === null || plan.price <= 0)?.id ??
        plans[0]?.id ??
        "",
    );
    setUpgradePhone("");
    setConfirmOpen(true);
    void loadPaymentMethods();
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Create campaign"
        description="Give it a clear name, a target, and a timeframe."
      />
      <Panel className="space-y-5 p-5 sm:p-6">
        <CampaignForm
          submitLabel="Create campaign"
          onCancel={() => nav({ to: "/organisation/campaigns" })}
          onSubmit={async (v) => {
            openPlanDialog(v);
          }}
        />
      </Panel>
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPendingInput(null);
            setConfirmOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose the subscription plan</DialogTitle>
            <DialogDescription>
              Choose a plan configured by the platform administrator. It applies only to this
              campaign; other campaigns are not affected.
              {selectedPlanIsPaid
                ? paymentProvider === "STRIPE"
                  ? " You’ll complete payment through Stripe’s secure card checkout."
                  : " Approve the M-Pesa payment prompt to activate the plan."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Plan" htmlFor="campaign-plan">
              <select
                id="campaign-plan"
                className={inputCls}
                value={selectedPlanCode}
                onChange={(event) => setSelectedPlanCode(event.target.value)}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                    {plan.maxMembers === null
                      ? " · Unlimited members"
                      : ` · up to ${plan.maxMembers} members`}
                    {plan.price === null || plan.price === 0
                      ? " · Free"
                      : ` · ${formatKES(plan.price)}/month`}
                  </option>
                ))}
              </select>
            </Field>
            {selectedPlanIsPaid && availablePaymentProviders.length > 1 && (
              <Field label="Payment method" htmlFor="campaign-plan-payment-method">
                <select
                  id="campaign-plan-payment-method"
                  className={inputCls}
                  value={paymentProvider ?? ""}
                  onChange={(event) => {
                    if (event.target.value === "MPESA" || event.target.value === "STRIPE")
                      setPaymentProvider(event.target.value);
                  }}
                >
                  {availablePaymentProviders.map((option) => (
                    <option key={option} value={option}>
                      {option === "MPESA" ? "M-Pesa" : "Card"}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {selectedPlanIsPaid &&
              paymentProvider === "MPESA" &&
              availablePaymentProviders.length > 0 && (
                <Field
                  label="M-Pesa phone number"
                  htmlFor="campaign-plan-phone"
                  hint="Approve the subscription payment prompt on this phone."
                >
                  <input
                    id="campaign-plan-phone"
                    className={inputCls}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0712 345 678"
                    value={upgradePhone}
                    onChange={(event) => setUpgradePhone(event.target.value)}
                  />
                </Field>
              )}
            {selectedPlanIsPaid && !paymentProviderLoading && paymentProviderError && (
              <p role="alert" className="text-sm text-destructive">
                {paymentProviderError}
              </p>
            )}
            {selectedPlanIsPaid &&
              !paymentProviderLoading &&
              !paymentProviderError &&
              availablePaymentProviders.length === 0 && (
                <p role="alert" className="text-sm text-destructive">
                  Subscription payments are temporarily unavailable. Choose a free plan if one is
                  configured, or contact the platform administrator.
                </p>
              )}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200">
              <p className="font-medium">Plan limit</p>
              <p className="mt-1">
                {!selectedPlan
                  ? "No subscription plans are configured. Please contact the platform administrator."
                  : selectedPlan.maxMembers === null
                    ? "This plan has no membership cap, so members can continue joining without a limit."
                    : `Members will not be able to join this campaign once the total active members exceed ${selectedPlan.maxMembers} on the ${selectedPlan.name} plan.`}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!pendingInput) return;
                setConfirmOpen(false);
                if (!selectedPlan) return;
                await createCampaign(pendingInput, selectedPlan, upgradePhone);
                setPendingInput(null);
              }}
              disabled={
                !selectedPlan ||
                (selectedPlanIsPaid &&
                  (paymentProviderLoading ||
                    Boolean(paymentProviderError) ||
                    availablePaymentProviders.length === 0 ||
                    !paymentProvider ||
                    (paymentProvider === "MPESA" && !upgradePhone.trim())))
              }
            >
              Continue and create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
