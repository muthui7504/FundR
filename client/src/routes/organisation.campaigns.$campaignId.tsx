import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Printer,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
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
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Panel,
  ProgressBar,
  StatCard,
  StatusBadge,
  inputCls,
} from "@/components/kit";
import { SkeletonList, SkeletonStats } from "@/components/loading-skeletons";
import { RaisedAreaChart } from "@/components/charts";
import { CampaignForm } from "@/components/campaigns/CampaignForm";
import { ShareCampaignButton } from "@/components/campaigns/ShareCampaignButton";
import { useDemo } from "@/context/DemoStore";
import {
  effectiveParticipantStatus,
  formatDate,
  formatKES,
  isCampaignEndDateExpired,
  pct,
  supporterLabel,
} from "@/utils/format";
import { publicAppUrl } from "@/utils/public-url";
import { meta } from "@/utils/meta";
import type { CampaignStatus, Contribution, ParticipantStatus } from "@/types";
import { api, type CampaignMember } from "@/services/api";
import type { CampaignMembershipOverview } from "@/types";

export const Route = createFileRoute("/organisation/campaigns/$campaignId")({
  head: () => meta("Campaign details", "Progress, members and contributions for this campaign."),
  component: Details,
});

const CAMPAIGN_STATUSES: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

function formatKenyanPhoneForDisplay(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0"))
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.length === 12 && digits.startsWith("254"))
    return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  return value.trim();
}

function formatPlanPrice(price: number | null) {
  return price === null || price === 0 ? "Free" : `${formatKES(price)}/month`;
}

function membershipExpiryStatus(status: string, expiresAt: string | null) {
  if (!expiresAt || (status !== "ACTIVE" && status !== "EXPIRED")) return null;
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs > 0) {
    const daysRemaining = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    return `Payment verified · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining to upgrade · expires ${formatDate(expiresAt)}`;
  }
  if (status === "EXPIRED") {
    const daysExpired = Math.floor(-remainingMs / (24 * 60 * 60 * 1000));
    return daysExpired === 0
      ? `Plan expired today · upgrade to restore campaign capacity`
      : `Plan expired ${daysExpired} day${daysExpired === 1 ? "" : "s"} ago · upgrade to restore campaign capacity`;
  }
  return `Plan expires today · upgrade to keep campaign capacity`;
}

function Details() {
  const { campaignId } = Route.useParams();
  const nav = useNavigate();
  const {
    user,
    campaigns,
    setCampaigns,
    participants,
    setParticipants,
    members,
    pledges,
    setPledges,
    profiles,
    setProfiles,
    contributions,
    plans,
  } = useDemo();
  const isAdmin = user?.role === "ORGANISATION_ADMIN";
  const c = campaigns.find((x) => x.id === campaignId);
  const [edit, setEdit] = useState(false);
  const [pending, setPending] = useState<CampaignStatus | null>(null);
  const [activateAfterEdit, setActivateAfterEdit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [campaignMembers, setCampaignMembers] = useState<CampaignMember[] | null>(null);
  const [campaignContributions, setCampaignContributions] = useState<Contribution[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(true);
  const [contributionsLoading, setContributionsLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [contributionsError, setContributionsError] = useState("");
  const [membersAttempt, setMembersAttempt] = useState(0);
  const [contributionsAttempt, setContributionsAttempt] = useState(0);
  const [shareLink, setShareLink] = useState("");
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [campaignMembership, setCampaignMembership] = useState<CampaignMembershipOverview | null>(
    null,
  );
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [paymentProvider, setPaymentProvider] = useState<"MPESA" | "STRIPE" | null>(null);
  const [availablePaymentProviders, setAvailablePaymentProviders] = useState<
    ("MPESA" | "STRIPE")[]
  >([]);
  const [paymentProviderLoading, setPaymentProviderLoading] = useState(true);
  const [paymentProviderError, setPaymentProviderError] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradePhone, setUpgradePhone] = useState("");
  const [upgradeTier, setUpgradeTier] = useState("");
  const [pendingMpesaCheckoutId, setPendingMpesaCheckoutId] = useState<string | null>(null);
  const [subscriptionPaymentStatus, setSubscriptionPaymentStatus] = useState<
    "PENDING" | "VERIFIED" | "FAILED" | null
  >(null);
  const [subscriptionPaymentMessage, setSubscriptionPaymentMessage] = useState("");
  const selectedUpgradePlan = plans.find((plan) => plan.id === upgradeTier);
  const selectedUpgradePlanIsPaid =
    selectedUpgradePlan?.price !== null &&
    selectedUpgradePlan?.price !== undefined &&
    selectedUpgradePlan.price > 0;
  const upgradePlanOptions = plans.filter(
    (plan) =>
      campaignMembership &&
      (plan.maxMembers === null ||
        plan.maxMembers >= campaignMembership.activeMemberCount + 1),
  );
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
    setCampaignMembers(null);
    setCampaignContributions(null);
    setMembersLoading(true);
    setContributionsLoading(true);
    setMembersError("");
    setContributionsError("");
    setMembershipLoading(true);
    setCampaignMembership(null);
    void api.campaigns
      .members(campaignId)
      .then((result) => {
        if (active) setCampaignMembers(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setMembersError(
            cause instanceof Error ? cause.message : "Unable to load campaign members.",
          );
      })
      .finally(() => {
        if (active) setMembersLoading(false);
      });
    void api.campaigns
      .contributions(campaignId)
      .then((result) => {
        if (active) setCampaignContributions(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setContributionsError(
            cause instanceof Error ? cause.message : "Unable to load contributions.",
          );
      })
      .finally(() => {
        if (active) setContributionsLoading(false);
      });
    void api.campaigns
      .membership(campaignId)
      .then((result) => {
        if (active) setCampaignMembership(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setMembersError(
            cause instanceof Error ? cause.message : "Unable to load campaign membership plan.",
          );
      })
      .finally(() => {
        if (active) setMembershipLoading(false);
      });
    void loadPaymentMethods(() => active);
    return () => {
      active = false;
    };
  }, [campaignId, loadPaymentMethods, membersAttempt, contributionsAttempt]);
  useEffect(() => {
    if (!pendingMpesaCheckoutId) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await api.subscriptions.mpesaSessionStatus(pendingMpesaCheckoutId);
        if (!active) return;
        setSubscriptionPaymentStatus(result.status);
        if (result.message) setSubscriptionPaymentMessage(result.message);
        if (result.status === "VERIFIED") {
          setPendingMpesaCheckoutId(null);
          setUpgradeOpen(false);
          toast.success("M-Pesa payment confirmed. Campaign plan activated.");
          try {
            const membership = await api.campaigns.membership(campaignId);
            if (active) setCampaignMembership(membership);
          } catch (cause) {
            toast.error(
              cause instanceof Error
                ? cause.message
                : "Payment confirmed, but campaign membership could not be refreshed.",
            );
          }
          return;
        }
        if (result.status === "FAILED") {
          setPendingMpesaCheckoutId(null);
          toast.error(result.message || "M-Pesa payment was not completed.");
          return;
        }
      } catch (cause) {
        if (!active) return;
        setSubscriptionPaymentMessage(
          cause instanceof Error
            ? `Unable to check payment status: ${cause.message}. Retrying…`
            : "Unable to check payment status. Retrying…",
        );
      }
      if (active) timeout = setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [campaignId, pendingMpesaCheckoutId]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("subscription_payment") === "cancelled") {
      url.searchParams.delete("subscription_payment");
      window.history.replaceState(window.history.state, "", url);
      toast.info("Stripe checkout was cancelled");
      return;
    }
    const sessionId = url.searchParams.get("session_id");
    if (url.searchParams.get("subscription_payment") !== "success" || !sessionId) return;
    let active = true;
    url.searchParams.delete("subscription_payment");
    url.searchParams.delete("session_id");
    window.history.replaceState(window.history.state, "", url);
    void api.subscriptions
      .stripeSessionStatus(sessionId)
      .then(async (result) => {
        if (!active) return;
        if (result.status === "VERIFIED") toast.success("Campaign subscription payment verified");
        else if (result.status === "FAILED")
          toast.error("Stripe checkout expired or the payment did not complete.");
        else toast.info("Payment received; waiting for final verification.");
        const membership = await api.campaigns.membership(campaignId);
        if (active) setCampaignMembership(membership);
      })
      .catch((cause: unknown) => {
        if (active)
          toast.error(
            cause instanceof Error
              ? cause.message
              : "Unable to verify Stripe subscription payment.",
          );
      });
    return () => {
      active = false;
    };
  }, [campaignId]);
  const visibleContributions = useMemo(
    () =>
      [
        ...(campaignContributions ??
          contributions.filter((item) => item.campaignId === campaignId)),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [campaignContributions, contributions, campaignId],
  );
  const [membersPage, setMembersPage] = useState(1);
  const [contributionsPage, setContributionsPage] = useState(1);
  const performance = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return {
        month: date.toLocaleDateString("en-KE", { month: "short" }),
        raised: visibleContributions
          .filter(
            (contribution) =>
              contribution.status === "COMPLETED" && contribution.createdAt.startsWith(key),
          )
          .reduce((total, contribution) => total + contribution.amount, 0),
      };
    });
  }, [visibleContributions]);
  if (!c)
    return (
      <Panel>
        <EmptyState
          title="Campaign not found"
          action={
            <Button asChild>
              <Link to="/organisation/campaigns">Back to campaigns</Link>
            </Button>
          }
        />
      </Panel>
    );
  const raised = visibleContributions
    .filter((contribution) => contribution.status === "COMPLETED")
    .reduce((total, contribution) => total + contribution.amount, 0);
  const pledged = pledges
    .filter((p) => p.campaignId === c.id && ["PENDING", "DUE_SOON", "OVERDUE"].includes(p.status))
    .reduce((a, p) => a + p.amount, 0);
  const parts =
    campaignMembers?.map((item) => item.participant) ??
    participants.filter((p) => p.campaignId === c.id);
  const membersPageSize = 5;
  const membersPages = Math.max(1, Math.ceil(parts.length / membersPageSize));
  const currentMembersPage = Math.min(membersPage, membersPages);
  const visibleMembers = parts.slice(
    (currentMembersPage - 1) * membersPageSize,
    currentMembersPage * membersPageSize,
  );
  const completedContributions = visibleContributions.filter((item) => item.status === "COMPLETED");
  const contributionsPageSize = 8;
  const contributionsPages = Math.max(
    1,
    Math.ceil(completedContributions.length / contributionsPageSize),
  );
  const currentContributionsPage = Math.min(contributionsPage, contributionsPages);
  const recent = completedContributions.slice(
    (currentContributionsPage - 1) * contributionsPageSize,
    currentContributionsPage * contributionsPageSize,
  );
  const exportCampaignMembers = () => {
    const cleanup = () => document.body.classList.remove("campaign-members-export");
    document.body.classList.add("campaign-members-export");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  };
  const copyShareLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setShareLinkCopied(true);
      window.setTimeout(() => setShareLinkCopied(false), 2000);
      toast.success("Campaign link copied");
    } catch {
      toast.error("Unable to copy the campaign link. Select and copy the link shown.");
    }
  };
  const createShareLink = async () => {
    if (shareLink) {
      await copyShareLink(shareLink);
      return;
    }
    setCreatingShareLink(true);
    try {
      const invitation = await api.organisations.inviteMember();
      const url = new URL(publicAppUrl(`/join/${encodeURIComponent(c.joinCode)}`));
      url.searchParams.set("invite", invitation.token);
      const generatedLink = url.toString();
      setShareLink(generatedLink);
      await copyShareLink(generatedLink);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to create the campaign link.");
    } finally {
      setCreatingShareLink(false);
    }
  };
  const refreshCampaignMembership = async () => {
    const result = await api.campaigns.membership(campaignId);
    setCampaignMembership(result);
  };
  const requestCampaignUpgrade = async () => {
    if (
      !campaignMembership ||
      !selectedUpgradePlan ||
      (selectedUpgradePlanIsPaid &&
        (!paymentProvider ||
          availablePaymentProviders.length === 0 ||
          (paymentProvider === "MPESA" && !upgradePhone.trim())))
    )
      return;
    setUpgradeBusy(true);
    setSubscriptionPaymentStatus(null);
    setSubscriptionPaymentMessage("");
    try {
      const result = await api.campaigns.upgradeMembership(campaignId, {
        planCode: upgradeTier,
        phone: upgradePhone,
        paymentProvider: selectedUpgradePlanIsPaid
          ? paymentProvider ?? undefined
          : undefined,
      });
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (result.status === "PENDING" && result.checkoutRequestId) {
        setSubscriptionPaymentStatus("PENDING");
        setSubscriptionPaymentMessage("Waiting for you to approve the M-Pesa prompt.");
        setPendingMpesaCheckoutId(result.checkoutRequestId);
        return;
      }
      toast.success(result.message);
      setUpgradeOpen(false);
      await refreshCampaignMembership();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to start campaign subscription payment.",
      );
    } finally {
      setUpgradeBusy(false);
    }
  };
  const setPart = (memberId: string, status: ParticipantStatus) =>
    setParticipants((ps) =>
      ps.map((p) => (p.memberId === memberId && p.campaignId === c.id ? { ...p, status } : p)),
    );
  return (
    <>
      <Link
        to="/organisation/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Campaigns
      </Link>
      <PageHeader
        title={c.name}
        description={`${formatDate(c.startDate)} – ${formatDate(c.endDate)}`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {CAMPAIGN_STATUSES.filter((status) => status !== c.status).map((status) => (
              <Button key={status} variant="outline" size="sm" onClick={() => setPending(status)}>
                Mark {status.toLowerCase()}
              </Button>
            ))}
            <Button size="sm" onClick={() => setEdit(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            {c.status === "ACTIVE" && (
              <ShareCampaignButton campaignName={c.name} joinCode={c.joinCode} />
            )}
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        }
      />
      {contributionsLoading && visibleContributions.length === 0 ? (
        <SkeletonStats />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            label="Actual raised"
            value={formatKES(raised)}
            hint={`${pct(raised, c.target)}% of target`}
          />
          <StatCard
            label="Pledged (outstanding)"
            value={formatKES(pledged)}
            hint="Not counted as raised"
            tone="warning"
          />
          <StatCard label="Target" value={formatKES(c.target)} tone="muted" />
          <StatCard
            label="Participants"
            value={String(parts.filter((p) => p.status === "ACTIVE").length)}
            tone="info"
          />
        </div>
      )}
      <Panel className="mt-6 p-5">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Actual progress</span>
          <span>{pct(raised, c.target)}%</span>
        </div>
        <ProgressBar value={pct(raised, c.target)} className="mt-2" />
        <p className="mt-4 text-sm text-muted-foreground">{c.description || c.shortDescription}</p>
      </Panel>
      <Panel className="mt-6 flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">Campaign membership plan</h2>
          {membershipLoading ? (
            <p role="status" className="mt-1 text-sm text-muted-foreground">
              Loading campaign capacity…
            </p>
          ) : campaignMembership ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {campaignMembership.activeMemberCount} active campaign{" "}
                {campaignMembership.activeMemberCount === 1 ? "member" : "members"} ·{" "}
                {campaignMembership.activePlan.name} ·{" "}
                {formatPlanPrice(campaignMembership.activePlan.price)}
                {campaignMembership.maxMembers !== null &&
                  ` · ${campaignMembership.remainingCapacity} of ${campaignMembership.maxMembers} places remaining`}
                {campaignMembership.maxMembers === null && " · No member limit"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {campaignMembership.subscriptionStatus === "ACTIVE"
                  ? membershipExpiryStatus(
                      campaignMembership.subscriptionStatus,
                      campaignMembership.subscriptionExpiresAt,
                    ) ?? "Payment verified"
                  : campaignMembership.subscriptionStatus === "FREE"
                    ? "This campaign is on the Free plan. Other campaigns and organisation members are unaffected."
                    : campaignMembership.subscriptionStatus === "EXPIRED"
                      ? membershipExpiryStatus(
                          campaignMembership.subscriptionStatus,
                          campaignMembership.subscriptionExpiresAt,
                        ) ?? "Plan expired · upgrade to restore campaign capacity."
                    : campaignMembership.subscriptionStatus === "UNCONFIGURED"
                      ? "No platform subscription plan is configured for this campaign."
                    : `Subscription status: ${campaignMembership.subscriptionStatus.toLowerCase().replace(/_/g, " ")}. Capacity increases after payment verification.`}
              </p>
              {campaignMembership.lastPaymentStatus === "PENDING" && (
                <p role="status" className="mt-1 text-xs text-warning">
                  The {campaignMembership.lastPaymentPlan} payment is awaiting M-Pesa verification.
                </p>
              )}
              {campaignMembership.lastPaymentStatus === "FAILED" && (
                <p className="mt-1 text-xs text-destructive">
                  The last campaign subscription payment failed.
                </p>
              )}
              {campaignMembership.atLimit && campaignMembership.requiredPlan && (
                <p role="status" className="mt-2 text-sm font-medium text-destructive">
                  This campaign has used all {campaignMembership.maxMembers}{" "}
                  {campaignMembership.activePlan.name.toLowerCase()} member places. Upgrade this
                  campaign to {campaignMembership.requiredPlan.name} (
                  {formatPlanPrice(campaignMembership.requiredPlan.price)}) to admit more.
                </p>
              )}
              {campaignMembership.upgradeRequired && !campaignMembership.requiredPlan && (
                <p role="status" className="mt-2 text-sm font-medium text-destructive">
                  No platform plan supports the next member. Please contact the platform
                  administrator.
                </p>
              )}
            </>
          ) : (
            <p role="status" className="mt-1 text-sm text-muted-foreground">
              Campaign subscription details are unavailable.
            </p>
          )}
        </div>
        {campaignMembership &&
          campaignMembership.requiredPlan &&
          (campaignMembership.atLimit || campaignMembership.upgradeRequired) && (
            <Button
              className="shrink-0"
              onClick={() => {
                setUpgradeTier(campaignMembership.requiredPlan?.code ?? "");
                setUpgradePhone("");
                setUpgradeOpen(true);
              }}
            >
              Upgrade campaign
            </Button>
          )}
      </Panel>
      <Dialog
        open={upgradeOpen}
        onOpenChange={(open) => {
          setUpgradeOpen(open);
          if (open) void loadPaymentMethods();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade this campaign</DialogTitle>
            <DialogDescription>
              Only this campaign’s member limit changes.{" "}
              {selectedUpgradePlanIsPaid
                ? `Capacity increases after the platform verifies your payment.${
                    paymentProvider === "STRIPE"
                      ? " You’ll continue to Stripe’s secure card checkout."
                      : " Approve the M-Pesa prompt to continue."
                  }`
                : "This plan is configured by the platform and has no payment due."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Plan" htmlFor="campaign-membership-plan">
              <select
                id="campaign-membership-plan"
                className={inputCls}
                value={upgradeTier}
                onChange={(event) => setUpgradeTier(event.target.value)}
              >
                {upgradePlanOptions.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {formatPlanPrice(plan.price)}
                      {plan.maxMembers === null
                        ? " · Unlimited members"
                        : ` · up to ${plan.maxMembers} members`}
                    </option>
                ))}
              </select>
            </Field>
            {selectedUpgradePlanIsPaid && availablePaymentProviders.length > 1 && (
              <Field label="Payment method" htmlFor="campaign-membership-payment-method">
                <select
                  id="campaign-membership-payment-method"
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
            {selectedUpgradePlanIsPaid &&
              paymentProvider === "MPESA" &&
              availablePaymentProviders.length > 0 && (
              <Field
                label="M-Pesa phone number"
                htmlFor="campaign-membership-phone"
                hint="Approve the payment prompt on this phone."
              >
                <input
                  id="campaign-membership-phone"
                  className={inputCls}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0712 345 678"
                  value={upgradePhone}
                  onChange={(event) => setUpgradePhone(event.target.value)}
                />
              </Field>
            )}
            {selectedUpgradePlanIsPaid && !paymentProviderLoading && paymentProviderError && (
              <p role="alert" className="text-sm text-destructive">
                {paymentProviderError}
              </p>
            )}
            {selectedUpgradePlanIsPaid &&
              !paymentProviderLoading &&
              !paymentProviderError &&
              availablePaymentProviders.length === 0 && (
                <p role="alert" className="text-sm text-destructive">
                  Subscription payments are temporarily unavailable. Please contact the platform
                  administrator.
                </p>
              )}
            {subscriptionPaymentStatus === "PENDING" && (
              <p role="status" className="text-sm text-primary">
                {subscriptionPaymentMessage || "Waiting for M-Pesa confirmation…"}
              </p>
            )}
            {subscriptionPaymentStatus === "FAILED" && (
              <p role="alert" className="text-sm text-destructive">
                {subscriptionPaymentMessage ||
                  "M-Pesa payment was not completed. You can try again."}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setUpgradeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                upgradeBusy ||
                subscriptionPaymentStatus === "PENDING" ||
                !selectedUpgradePlan ||
                (selectedUpgradePlanIsPaid &&
                  (paymentProviderLoading ||
                    Boolean(paymentProviderError) ||
                    availablePaymentProviders.length === 0 ||
                    !paymentProvider ||
                    (paymentProvider === "MPESA" && !upgradePhone.trim())))
              }
              onClick={() => void requestCampaignUpgrade()}
            >
              {subscriptionPaymentStatus === "PENDING"
                ? "Waiting for payment…"
                : upgradeBusy
                  ? paymentProvider === "STRIPE"
                    ? "Opening secure checkout…"
                    : "Sending prompt…"
                  : selectedUpgradePlanIsPaid
                    ? "Continue to payment"
                    : "Activate plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={subscriptionPaymentStatus === "PENDING"}
        onOpenChange={() => {
          if (subscriptionPaymentStatus === "PENDING") return;
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => {
            if (subscriptionPaymentStatus === "PENDING") event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (subscriptionPaymentStatus === "PENDING") event.preventDefault();
          }}
        >
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Smartphone className="size-7" aria-hidden="true" />
            </div>
            <DialogTitle className="text-center text-xl">Approve your M-Pesa payment</DialogTitle>
            <DialogDescription className="text-center">
              We’ve sent an STK push to your phone. Enter your M-Pesa PIN on your phone to approve
              this campaign upgrade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Smartphone className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">STK push sent to</p>
                  <p className="mt-0.5 text-lg font-semibold tracking-wide">
                    {formatKenyanPhoneForDisplay(upgradePhone)}
                  </p>
                </div>
                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                  Sent
                </span>
              </div>
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    {selectedUpgradePlan?.name ?? "Campaign"}{" "}
                    campaign plan upgrade
                  </p>
                  <p className="shrink-0 text-sm font-semibold">
                    {formatKES(selectedUpgradePlan?.price ?? 0)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open the M-Pesa prompt on that phone and enter your PIN to authorize the payment.
                </p>
              </div>
            </div>
            <div
              className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="mt-0.5 size-4 shrink-0 animate-spin text-primary"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">Waiting for approval</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {subscriptionPaymentMessage ||
                    "We’re checking the payment status automatically. Keep this page open."}
                </p>
              </div>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Your M-Pesa PIN is entered on your phone, never on this page.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <h2 className="font-semibold">Performance</h2>
          <p className="text-xs text-muted-foreground">
            Completed contributions only · last six months
          </p>
          <div className="mt-4">
            <RaisedAreaChart data={performance} />
          </div>
        </Panel>
        <Panel className="p-5">
          <h2 className="font-semibold">Share join link</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Members can join with the code. The share link also includes an organisation invitation
            for people who need an account.
          </p>
          <div className="mt-4 break-all rounded-xl bg-muted p-3 font-mono text-xs">
            {shareLink ||
              "Create a member link to share. It includes an organisation invitation and expires after seven days."}
          </div>
          <p className="mt-2 text-sm">
            Code: <span className="font-mono font-semibold">{c.joinCode}</span>
          </p>
          <Button
            className="mt-4 w-full"
            variant="outline"
            disabled={creatingShareLink}
            onClick={() => void createShareLink()}
          >
            {creatingShareLink ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : shareLinkCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {creatingShareLink
              ? "Creating member link…"
              : shareLinkCopied
                ? "Copied!"
                : shareLink
                  ? "Copy join link"
                  : "Create and copy member link"}
          </Button>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <h2 className="font-semibold">Campaign members</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={exportCampaignMembers}
              disabled={parts.length === 0}
            >
              <Printer className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
          {membersLoading && parts.length > 0 && (
            <p
              role="status"
              className="flex items-center gap-2 px-5 pt-4 text-xs text-muted-foreground"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing members…
            </p>
          )}
          {membersError && (
            <ErrorState
              message={membersError}
              onRetry={() => setMembersAttempt((value) => value + 1)}
            />
          )}
          {membersLoading && parts.length === 0 ? (
            <SkeletonList rows={4} />
          ) : parts.length === 0 ? (
            <EmptyState
              title="No members yet"
              description="Share the join link to invite members."
            />
          ) : (
            <ul className="divide-y">
              {visibleMembers.map((p) => {
                const loaded = campaignMembers?.find(
                  (item) => item.participant.memberId === p.memberId,
                );
                const m = loaded?.member ?? members.find((x) => x.id === p.memberId);
                return (
                  <li
                    key={p.memberId}
                    className="flex items-center justify-between gap-3 p-4 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {formatDate(p.joinedAt)}
                      </p>
                      {loaded && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatKES(loaded.raised)} raised
                          {loaded.profile?.target
                            ? ` of ${formatKES(loaded.profile.target)} (${Math.round(loaded.progress)}%)`
                            : " · no fundraising target set"}
                        </p>
                      )}
                      {loaded?.profile && (
                        <ProgressBar size="sm" value={loaded.progress} className="mt-2 max-w-xs" />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge
                        status={c ? effectiveParticipantStatus(c.status, p.status) : p.status}
                      />
                      {c?.status === "ACTIVE" && p.status === "ACTIVE" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPart(p.memberId, "SUSPENDED")}
                        >
                          Suspend
                        </Button>
                      )}
                      {c?.status === "ACTIVE" && p.status === "SUSPENDED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPart(p.memberId, "ACTIVE")}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {membersPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {currentMembersPage} of {membersPages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Previous members page"
                  disabled={currentMembersPage <= 1}
                  onClick={() => setMembersPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Next members page"
                  disabled={currentMembersPage >= membersPages}
                  onClick={() => setMembersPage((page) => Math.min(membersPages, page + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Panel>
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <h2 className="font-semibold">Recent contributions</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.print()}
              disabled={visibleContributions.length === 0}
            >
              <Printer className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
          {contributionsLoading && recent.length > 0 && (
            <p
              role="status"
              className="flex items-center gap-2 px-5 pt-4 text-xs text-muted-foreground"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing contributions…
            </p>
          )}
          {contributionsError && (
            <ErrorState
              message={contributionsError}
              onRetry={() => setContributionsAttempt((value) => value + 1)}
            />
          )}
          {contributionsLoading && recent.length === 0 ? (
            <SkeletonList rows={4} />
          ) : recent.length === 0 ? (
            <EmptyState title="No completed contributions yet" />
          ) : (
            <ul className="divide-y">
              {recent.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{supporterLabel(x.supporterName)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(x.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold">{formatKES(x.amount)}</span>
                    <StatusBadge status={x.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {contributionsPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {currentContributionsPage} of {contributionsPages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Previous contributions page"
                  disabled={currentContributionsPage <= 1}
                  onClick={() => setContributionsPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Next contributions page"
                  disabled={currentContributionsPage >= contributionsPages}
                  onClick={() =>
                    setContributionsPage((page) => Math.min(contributionsPages, page + 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Panel>
        <div className="campaign-members-print hidden">
          <h1>{c.name} — Campaign members</h1>
          <p>
            Exported {formatDate(new Date().toISOString())} · {parts.length} members
          </p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((participant) => {
                const loaded = campaignMembers?.find(
                  (item) => item.participant.memberId === participant.memberId,
                );
                const member =
                  loaded?.member ?? members.find((item) => item.id === participant.memberId);
                return (
                  <tr key={participant.memberId}>
                    <td>{member?.name ?? "Campaign member"}</td>
                    <td>{member?.email ?? ""}</td>
                    <td>{member?.phone ?? ""}</td>
                    <td>{formatDate(participant.joinedAt)}</td>
                    <td>
                      {c
                        ? effectiveParticipantStatus(c.status, participant.status)
                        : participant.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="campaign-contributions-print hidden">
          <h1>{c.name} — Contributions</h1>
          <p>
            Exported {formatDate(new Date().toISOString())} · {visibleContributions.length}{" "}
            contributions
          </p>
          <table>
            <thead>
              <tr>
                <th>Supporter</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleContributions.map((contribution) => (
                <tr key={contribution.id}>
                  <td>{supporterLabel(contribution.supporterName)}</td>
                  <td>{formatDate(contribution.createdAt)}</td>
                  <td>{formatKES(contribution.amount)}</td>
                  <td>{contribution.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit campaign</DialogTitle>
          </DialogHeader>
          <CampaignForm
            initial={c}
            submitLabel={activateAfterEdit ? "Update dates and activate" : "Save changes"}
            onCancel={() => {
              setEdit(false);
              setActivateAfterEdit(false);
            }}
            onSubmit={async (v) => {
              try {
                const updated = await api.campaigns.update(c.id, {
                  ...v,
                  ...(activateAfterEdit ? { status: "ACTIVE" as const } : {}),
                });
                setCampaigns((cs) => cs.map((x) => (x.id === updated.id ? updated : x)));
                setEdit(false);
                setActivateAfterEdit(false);
                toast.success(
                  activateAfterEdit
                    ? "End date updated and campaign activated"
                    : "Campaign updated",
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to update campaign.");
              }
            }}
          />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={
          pending === "ACTIVE" && isCampaignEndDateExpired(c.endDate)
            ? "Update end date before activating?"
            : `Change status to ${pending?.toLowerCase()}?`
        }
        description={
          pending === "ACTIVE" && isCampaignEndDateExpired(c.endDate)
            ? "This campaign's end date has passed. Choose a future end date to reactivate it."
            : "This affects whether supporters can contribute to the campaign."
        }
        confirmLabel={
          pending === "ACTIVE" && isCampaignEndDateExpired(c.endDate)
            ? "Update end date"
            : "Change status"
        }
        onConfirm={() => {
          if (!pending) return;
          if (pending === "ACTIVE" && isCampaignEndDateExpired(c.endDate)) {
            setPending(null);
            setActivateAfterEdit(true);
            setEdit(true);
            return;
          }
          void api.campaigns
            .update(c.id, { status: pending })
            .then((updated) => {
              setCampaigns((cs) => cs.map((x) => (x.id === updated.id ? updated : x)));
              toast.success("Status updated");
              setPending(null);
            })
            .catch((error) => {
              toast.error(
                error instanceof Error ? error.message : "Unable to update campaign status.",
              );
            });
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${c.name}?`}
        description="This permanently removes the campaign and its members, fundraising pages, pledges, and contributions. This cannot be undone."
        confirmLabel="Delete campaign"
        destructive
        onConfirm={() => {
          void (async () => {
            try {
              await api.campaigns.delete(c.id);
              setCampaigns((cs) => cs.filter((x) => x.id !== c.id));
              setParticipants((ps) => ps.filter((p) => p.campaignId !== c.id));
              setProfiles((ps) => ps.filter((p) => p.campaignId !== c.id));
              setPledges((ps) => ps.filter((p) => p.campaignId !== c.id));
              toast.success("Campaign deleted");
              await nav({ to: "/organisation/campaigns" });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Unable to delete campaign.");
            }
          })();
        }}
      />
    </>
  );
}
