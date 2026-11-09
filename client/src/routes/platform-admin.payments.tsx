import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageHeader, Panel, StatusBadge } from "@/components/kit";
import { useDemo } from "@/context/DemoStore";
import { api } from "@/services/api";
import type { PlatformOrganisationSubscriptions } from "@/types";
import { formatDate, formatKES, maskPhone } from "@/utils/format";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/platform-admin/payments")({
  head: () =>
    meta(
      "Payments & billing",
      "Campaign subscriptions and recent M-Pesa contribution activity across Fundraise.",
    ),
  component: Payments,
});

function Payments() {
  const { campaigns, contributions } = useDemo();
  const [organisationSubscriptions, setOrganisationSubscriptions] = useState<
    PlatformOrganisationSubscriptions[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api.platform
      .campaignSubscriptions()
      .then((result) => {
        if (active) setOrganisationSubscriptions(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : "Unable to load campaign subscription details.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const campaignSubscriptions = useMemo(
    () =>
      organisationSubscriptions.flatMap(({ organisation, campaigns: items }) =>
        items.map((item) => ({ organisation, ...item })),
      ),
    [organisationSubscriptions],
  );
  const sortedCampaignSubscriptions = useMemo(
    () =>
      [...campaignSubscriptions].sort((a, b) => {
        const aRemaining = a.membership.remainingCapacity;
        const bRemaining = b.membership.remainingCapacity;
        const aNeedsUpgrade =
          a.membership.maxMembers !== null && aRemaining !== null && aRemaining < 10;
        const bNeedsUpgrade =
          b.membership.maxMembers !== null && bRemaining !== null && bRemaining < 10;
        if (aNeedsUpgrade !== bNeedsUpgrade) return aNeedsUpgrade ? -1 : 1;
        if (aNeedsUpgrade && bNeedsUpgrade) return (aRemaining ?? 0) - (bRemaining ?? 0);
        return a.organisation.name.localeCompare(b.organisation.name);
      }),
    [campaignSubscriptions],
  );
  const planSummaries = useMemo(() => {
    const summaries = new Map<
      string,
      { name: string; price: number | null; total: number; active: number }
    >();
    for (const { membership } of campaignSubscriptions) {
      const code = membership.activePlan.code;
      const current = summaries.get(code) ?? {
        name: membership.activePlan.name,
        price: membership.activePlan.price,
        total: 0,
        active: 0,
      };
      current.total += 1;
      if (
        membership.subscriptionStatus === "ACTIVE" ||
        membership.subscriptionStatus === "FREE"
      )
        current.active += 1;
      summaries.set(code, current);
    }
    return [...summaries.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [campaignSubscriptions]);
  const recent = contributions.slice(0, 10);

  return (
    <>
      <PageHeader
        title="Payments & billing"
        description="Campaign subscriptions and recent M-Pesa payments."
      />
      {error ? (
        <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {loading && planSummaries.length === 0 ? (
              <Panel className="flex items-center gap-2 p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading campaign plans…
              </Panel>
            ) : planSummaries.length === 0 ? (
              <Panel className="p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">
                No campaign plans to summarize.
              </Panel>
            ) : (
              planSummaries.map(([code, plan]) => (
                <Panel key={code} className="p-4">
                  <p className="text-xs text-muted-foreground">{plan.name} campaign plan</p>
                  <p className="mt-1 text-lg font-bold">
                    {code === "UNCONFIGURED"
                      ? "Not configured"
                      : plan.price === null || plan.price === 0
                        ? "Free"
                        : `${formatKES(plan.price)}/month`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plan.active} active · {plan.total} campaigns
                  </p>
                </Panel>
              ))
            )}
          </div>
          <Panel className="overflow-x-auto">
            <div className="border-b p-4">
              <h2 className="font-semibold">Campaign subscriptions</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Current status and payment history for each organisation’s campaigns.
              </p>
            </div>
            {loading ? (
              <p
                role="status"
                className="flex items-center gap-2 p-5 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading subscriptions…
              </p>
            ) : campaignSubscriptions.length === 0 ? (
              <EmptyState
                title="No campaign subscriptions"
                description="Campaign subscription records will appear here."
              />
            ) : (
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Organisation</th>
                    <th className="p-3">Campaign</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">Members / capacity</th>
                    <th className="p-3">Expires</th>
                    <th className="p-3">Latest payment</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedCampaignSubscriptions.map(
                    ({ organisation, campaign, membership, expiresAt, payments }) => {
                      const latestPayment = payments[0];
                      const remainingCapacity = membership.remainingCapacity;
                      const needsUpgradeSoon =
                        membership.maxMembers !== null &&
                        remainingCapacity !== null &&
                        remainingCapacity < 10;
                      return (
                        <tr key={campaign.id}>
                          <td className="p-3 font-medium">
                            <div>
                              <Link
                                to="/platform-admin/organisation/$organisationId"
                                params={{ organisationId: organisation.id }}
                                className="hover:text-primary"
                              >
                                {organisation.name}
                              </Link>
                              {organisation.phone ? (
                                <a
                                  href={`tel:${organisation.phone.replace(/[^\d+]/g, "")}`}
                                  className="mt-1 flex items-center gap-1 text-xs font-normal text-primary hover:underline"
                                  aria-label={`Call ${organisation.name} contact at ${organisation.phone}`}
                                >
                                  <Phone className="h-3 w-3" />
                                  {organisation.phone}
                                </a>
                              ) : (
                                <p className="mt-1 text-xs font-normal text-muted-foreground">
                                  No contact phone recorded
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <p>{campaign.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {campaign.status.toLowerCase()}
                            </p>
                            {needsUpgradeSoon && (
                              <p
                                className={`mt-1 flex items-center gap-1 text-xs font-semibold ${remainingCapacity === 0 ? "text-destructive" : "text-warning"}`}
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {remainingCapacity === 0
                                  ? "Full · upgrade needed"
                                  : `Upgrade soon · ${remainingCapacity} places left`}
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            <p>{membership.activePlan.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {membership.activePlan.code === "UNCONFIGURED"
                                ? "Not configured"
                                : membership.activePlan.price === null ||
                                    membership.activePlan.price === 0
                                  ? "Free"
                                  : `${formatKES(membership.activePlan.price)}/month`}
                            </p>
                          </td>
                          <td className="p-3">
                            {membership.activeMemberCount} / {membership.maxMembers ?? "Unlimited"}
                            {membership.maxMembers !== null && (
                              <p className="text-xs text-muted-foreground">
                                {membership.remainingCapacity} places remaining
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            {expiresAt && membership.paymentVerified ? formatDate(expiresAt) : "—"}
                            {membership.subscriptionStatus === "PENDING" && (
                              <p className="text-xs text-warning">Payment pending</p>
                            )}
                          </td>
                          <td className="p-3">
                            {latestPayment ? (
                              <>
                                <p>
                                  {formatKES(latestPayment.amount)} ·{" "}
                                  {latestPayment.paymentMethod.replace(/_/g, " ")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {latestPayment.paymentReference ||
                                    latestPayment.receipt ||
                                    formatDate(latestPayment.createdAt)}
                                </p>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-3">
                            <StatusBadge status={membership.subscriptionStatus} />
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
      <details className="group mt-6 overflow-hidden rounded-2xl border bg-card shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>
            Recent M-Pesa contributions
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({recent.length}) · Click to view
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Receipt</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Campaign</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Date</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recent.map((contribution) => (
                <tr key={contribution.id}>
                  <td className="p-3 font-mono text-xs">{contribution.receipt ?? "—"}</td>
                  <td className="p-3">{maskPhone(contribution.phone)}</td>
                  <td className="p-3">
                    {campaigns.find((campaign) => campaign.id === contribution.campaignId)?.name}
                  </td>
                  <td className="p-3 font-semibold">{formatKES(contribution.amount)}</td>
                  <td className="p-3">{formatDate(contribution.createdAt)}</td>
                  <td className="p-3">
                    <StatusBadge status={contribution.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
