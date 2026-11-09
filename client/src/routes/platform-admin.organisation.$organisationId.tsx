import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Building2, Loader2, Mail, Phone, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Field, PageHeader, Panel, StatCard, StatusBadge, inputCls } from "@/components/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailPageSkeleton } from "@/components/loading-skeletons";
import { api } from "@/services/api";
import type { Campaign, CampaignMembershipOverview, Contribution, Member, Organisation, Participant, Plan } from "@/types";
import { formatDate, formatKES } from "@/utils/format";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/platform-admin/organisation/$organisationId")({
  head: () => meta("Organisation details", "Review an organisation and its campaigns."),
  component: OrganisationDetails,
});

type OrganisationData = {
  organisation: Organisation;
  campaigns: Campaign[];
  members: Member[];
  participants: Participant[];
  contributions: Contribution[];
  campaignPayments: {
    id: string;
    campaignId: string | null;
    planCode: string;
    amount: number;
    status: string;
    paymentMethod: string;
    paymentReference: string | null;
    createdAt: string;
    verifiedAt: string | null;
  }[];
};

function OrganisationDetails() {
  const { organisationId } = Route.useParams();
  const [data, setData] = useState<OrganisationData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [campaignMemberships, setCampaignMemberships] = useState<Record<string, CampaignMembershipOverview>>({});
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [manualPlan, setManualPlan] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    setLoading(true);
    void api.platform.organisation(organisationId)
      .then(async (result) => {
        if (!active) return;
        setData(result);
        const memberships = await Promise.allSettled(
          result.campaigns.map((campaign) => api.campaigns.membership(campaign.id)),
        );
        if (!active) return;
        setCampaignMemberships(Object.fromEntries(
          memberships.flatMap((membership) =>
            membership.status === "fulfilled"
              ? [[membership.value.campaignId, membership.value]]
              : [],
          ),
        ));
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load organisation details.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organisationId, attempt]);
  useEffect(() => {
    let active = true;
    void api.platform.plans()
      .then((result) => {
        if (active) setPlans(result);
      })
      .catch((cause: unknown) => {
        if (active)
          toast.error(
            cause instanceof Error ? cause.message : "Unable to load platform subscription plans.",
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (loading) return <DetailPageSkeleton />;
  if (error) {
    return <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />;
  }
  if (!data) return <ErrorState message="Organisation details are unavailable." onRetry={() => setAttempt((value) => value + 1)} />;

  const { organisation, campaigns, members, participants, contributions } = data;
  const raised = contributions
    .filter((contribution) => contribution.status === "COMPLETED")
    .reduce((total, contribution) => total + contribution.amount, 0);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
  const currentCampaignMembers = selectedCampaign
    ? participants.filter((participant) =>
        participant.campaignId === selectedCampaign.id && participant.status === "ACTIVE",
      ).length
    : 0;
  const availablePlans = plans
    .filter(
      (plan) =>
        plan.price !== null &&
        plan.price > 0 &&
        (plan.maxMembers === null || plan.maxMembers >= currentCampaignMembers + 1),
    )
    .sort((left, right) => left.minMembers - right.minMembers);
  const getPlanName = (code: string) =>
    plans.find(
      (plan) =>
        plan.id === code ||
        plan.name.trim().toUpperCase().replace(/\s+/g, "_") === code,
    )?.name ?? code;
  const submitManualPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCampaign) return;
    setRecordingPayment(true);
    try {
      const result = await api.platform.recordManualCampaignPayment(selectedCampaign.id, {
        planCode: manualPlan,
        paymentMethod,
        paymentReference: paymentReference.trim() || undefined,
        note: paymentNote.trim() || undefined,
      });
      toast.success(`${getPlanName(result.planCode)} plan activated for ${formatKES(result.amount)}.`, {
        description: `Active through ${formatDate(result.expiresAt.slice(0, 10))}.`,
      });
      setSelectedCampaign(null);
      setPaymentReference("");
      setPaymentNote("");
      const membership = await api.campaigns.membership(selectedCampaign.id);
      setCampaignMemberships((current) => ({ ...current, [selectedCampaign.id]: membership }));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to record the offline payment.");
    } finally {
      setRecordingPayment(false);
    }
  };

  return (
    <>
      <Link to="/platform-admin/organisations" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Organisations
      </Link>
      <PageHeader
        title={organisation.name}
        description={`${organisation.type} · registered ${formatDate(organisation.createdAt)}`}
        actions={<StatusBadge status={organisation.status} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Campaigns" value={String(campaigns.length)} hint={`${activeCampaigns} active`} icon={<Building2 className="h-5 w-5" />} tone="info" />
        <StatCard label="Members" value={String(members.length)} />
        <StatCard label="Verified funds raised" value={formatKES(raised)} />
        <StatCard label="Organisation status" value={organisation.status === "ACTIVE" ? "Active" : "Suspended"} tone={organisation.status === "ACTIVE" ? "primary" : "warning"} />
      </div>

      <Panel className="mt-6 p-5">
        <h2 className="font-semibold">Organisation details</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{organisation.email || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Phone</dt><dd className="mt-1 flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{organisation.phone || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-1">{[organisation.city, organisation.country].filter(Boolean).join(", ") || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Website</dt><dd className="mt-1 truncate">{organisation.website || "—"}</dd></div>
        </dl>
        {organisation.description && <p className="mt-4 text-sm text-muted-foreground">{organisation.description}</p>}
      </Panel>

      <Panel className="mt-6 overflow-x-auto">
        <div className="border-b p-5">
          <h2 className="font-semibold">Campaigns created by this organisation</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review campaigns and record verified offline subscription payments.</p>
        </div>
        {campaigns.length === 0 ? <EmptyState title="No campaigns created" description="This organisation has not created any campaigns yet." /> : (
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-4">Campaign</th><th className="p-4">Status</th><th className="p-4">Created</th><th className="p-4">Expected end</th><th className="p-4">Target</th><th className="p-4">Participants</th><th className="p-4">Campaign plan</th><th className="p-4">Offline payment</th></tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((campaign) => {
                const membership = campaignMemberships[campaign.id];
                return (
                <tr key={campaign.id}>
                  <td className="p-4"><p className="font-semibold">{campaign.name}</p><p className="mt-1 max-w-xs truncate text-xs text-muted-foreground">{campaign.shortDescription || campaign.description || "No description"}</p></td>
                  <td className="p-4"><StatusBadge status={campaign.status} /></td>
                  <td className="p-4">{formatDate(campaign.createdAt ?? campaign.startDate)}</td>
                  <td className="p-4">{formatDate(campaign.endDate)}</td>
                  <td className="p-4">{formatKES(campaign.target)}</td>
                  <td className="p-4">{participants.filter((participant) => participant.campaignId === campaign.id && participant.status === "ACTIVE").length}</td>
                  <td className="p-4">
                    {membership ? (
                      <div>
                        <StatusBadge status={membership.subscriptionStatus} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {membership.activePlan.name}
                          {membership.subscriptionExpiresAt &&
                            ` · until ${formatDate(membership.subscriptionExpiresAt.slice(0, 10))}`}
                        </p>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Loading plan…</span>}
                  </td>
                  <td className="p-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10"
                      onClick={() => {
                        const activeCount = participants.filter((participant) =>
                          participant.campaignId === campaign.id && participant.status === "ACTIVE",
                        ).length;
                        const eligiblePlans = plans
                          .filter(
                            (plan) =>
                              plan.price !== null &&
                              plan.price > 0 &&
                              (plan.maxMembers === null ||
                                plan.maxMembers >= activeCount + 1),
                          )
                          .sort((left, right) => left.minMembers - right.minMembers);
                        setManualPlan(eligiblePlans[0]?.id ?? "");
                        setPaymentMethod("CASH");
                        setPaymentReference("");
                        setPaymentNote("");
                        setSelectedCampaign(campaign);
                      }}
                    >
                      <ReceiptText className="h-4 w-4" />
                      Record payment
                    </Button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel className="mt-6 overflow-x-auto">
        <div className="border-b p-5">
          <h2 className="font-semibold">Campaign subscription payments</h2>
          <p className="mt-1 text-sm text-muted-foreground">Includes manually verified offline payments and platform-processed payments.</p>
        </div>
        {data.campaignPayments.length === 0 ? (
          <EmptyState title="No campaign subscription payments" description="Recorded payments will appear here." />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-4">Campaign</th><th className="p-4">Plan</th><th className="p-4">Amount</th><th className="p-4">Method</th><th className="p-4">Reference</th><th className="p-4">Paid</th><th className="p-4">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.campaignPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="p-4">{campaigns.find((campaign) => campaign.id === payment.campaignId)?.name ?? "Campaign"}</td>
                  <td className="p-4">{getPlanName(payment.planCode)}</td>
                  <td className="p-4 font-semibold">{formatKES(payment.amount)}</td>
                  <td className="p-4">{payment.paymentMethod.replace(/_/g, " ")}</td>
                  <td className="p-4 font-mono text-xs">{payment.paymentReference || "—"}</td>
                  <td className="p-4">{formatDate(payment.verifiedAt ?? payment.createdAt)}</td>
                  <td className="p-4"><StatusBadge status={payment.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Dialog open={Boolean(selectedCampaign)} onOpenChange={(open) => {
        if (!open && !recordingPayment) setSelectedCampaign(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record offline campaign payment</DialogTitle>
            <DialogDescription>
              Confirm that payment was received outside the platform. This will activate the selected campaign plan for 30 days and create an audit record.
            </DialogDescription>
          </DialogHeader>
          {selectedCampaign && (
            <form onSubmit={(event) => void submitManualPayment(event)} className="space-y-4">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-sm font-semibold">{selectedCampaign.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {currentCampaignMembers} active participant{currentCampaignMembers === 1 ? "" : "s"}
                </p>
              </div>
              <Field label="Plan" htmlFor="manual-campaign-plan">
                <select
                  id="manual-campaign-plan"
                  className={inputCls}
                  value={manualPlan}
                  onChange={(event) => setManualPlan(event.target.value)}
                  required
                >
                  {availablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatKES(plan.price ?? 0)}/month
                    {plan.maxMembers === null
                      ? " · Unlimited members"
                      : ` · up to ${plan.maxMembers} members`}
                  </option>
                  ))}
                </select>
              </Field>
              {availablePlans.length === 0 && (
                <p role="alert" className="text-sm text-destructive">
                  No configured paid platform plan can support the next campaign member.
                </p>
              )}
              <Field label="Payment method" htmlFor="manual-payment-method">
                <select
                  id="manual-payment-method"
                  className={inputCls}
                  value={paymentMethod}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "CASH" || value === "BANK_TRANSFER" || value === "OTHER")
                      setPaymentMethod(value);
                  }}
                  required
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Payment reference (optional)" htmlFor="manual-payment-reference">
                <input
                  id="manual-payment-reference"
                  className={inputCls}
                  maxLength={120}
                  placeholder="Receipt or transaction reference"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                />
              </Field>
              <Field label="Admin note (optional)" htmlFor="manual-payment-note">
                <textarea
                  id="manual-payment-note"
                  className="min-h-24 w-full rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  maxLength={500}
                  placeholder="Add context for the audit record"
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                The campaign plan will be activated through the database transaction after you confirm receipt of {formatKES(
                  availablePlans.find((plan) => plan.id === manualPlan)?.price ?? 0,
                )}.
              </p>
              <DialogFooter>
                <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={recordingPayment || availablePlans.length === 0}>
                  {recordingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                  {recordingPayment ? "Recording payment…" : "Confirm payment received"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
