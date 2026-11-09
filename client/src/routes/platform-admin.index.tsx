import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Building2, Loader2, Megaphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, StatCard, StatusBadge } from "@/components/kit";
import { RaisedAreaChart } from "@/components/charts";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { api } from "@/services/api";
import type { PlatformOrganisationSubscriptions } from "@/types";
import { formatDate, formatKES } from "@/utils/format";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/platform-admin/")({
  head: () =>
    meta(
      "Platform overview",
      "Organisations, campaigns, verified funds and billing health across FundR.",
    ),
  component: Overview,
});

function Overview() {
  const { organisations, campaigns, audit, contributions } = useDemo();
  const [organisationSubscriptions, setOrganisationSubscriptions] = useState<
    PlatformOrganisationSubscriptions[]
  >([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [subscriptionsError, setSubscriptionsError] = useState("");
  const [subscriptionsAttempt, setSubscriptionsAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setSubscriptionsLoading(true);
    setSubscriptionsError("");
    void api.platform
      .campaignSubscriptions()
      .then((result) => {
        if (active) setOrganisationSubscriptions(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setSubscriptionsError(
          cause instanceof Error ? cause.message : "Unable to load campaign subscription details.",
        );
      })
      .finally(() => {
        if (active) setSubscriptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subscriptionsAttempt]);

  const campaignSubscriptions = useMemo(
    () => organisationSubscriptions.flatMap((item) => item.campaigns),
    [organisationSubscriptions],
  );
  const atRisk = campaignSubscriptions.filter(({ membership }) =>
    ["PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "EXPIRED", "FAILED"].includes(
      membership.subscriptionStatus,
    ),
  );
  const activeSubscriptions = campaignSubscriptions.filter(
    ({ membership }) => membership.subscriptionStatus === "ACTIVE",
  );
  const monthlyRevenue = activeSubscriptions.reduce(
    (total, { membership }) => total + (membership.activePlan.price ?? 0),
    0,
  );
  const raised = campaigns.reduce((total, campaign) => total + campaignRaised(campaign.id), 0);
  const activeOrgs = organisations.filter(
    (organisation) => organisation.status === "ACTIVE",
  ).length;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
  const monthlySeries = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    const month = date.toLocaleString("en", { month: "short" });
    return {
      month,
      raised: contributions
        .filter(
          (contribution) =>
            contribution.status === "COMPLETED" &&
            new Date(contribution.createdAt).getMonth() === date.getMonth() &&
            new Date(contribution.createdAt).getFullYear() === date.getFullYear(),
        )
        .reduce((total, contribution) => total + contribution.amount, 0),
    };
  });

  return (
    <>
      <PageHeader title="Platform overview" description="Everything happening across FundR." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Verified funds raised"
          value={formatKES(raised)}
          hint="All organisations"
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Organisations"
          value={String(organisations.length)}
          hint={`${activeOrgs} active`}
          icon={<Building2 className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label="Active campaigns"
          value={String(activeCampaigns)}
          hint={`${campaigns.length} total`}
          icon={<Megaphone className="h-5 w-5" />}
          tone="muted"
        />
        <StatCard
          label="Monthly campaign subscriptions"
          value={subscriptionsLoading ? "…" : formatKES(monthlyRevenue)}
          hint={
            subscriptionsLoading
              ? "Loading campaign plans"
              : `${activeSubscriptions.length} active · ${atRisk.length} need attention`
          }
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warning"
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <h2 className="font-semibold">Funds raised across the platform</h2>
          <p className="text-xs text-muted-foreground">Verified M-Pesa contributions per month</p>
          <div className="mt-4">
            <RaisedAreaChart data={monthlySeries} />
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Billing attention</h2>
            <Link to="/platform-admin/payments" className="text-xs text-primary">
              View all
            </Link>
          </div>
          {subscriptionsLoading ? (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading campaign subscriptions…
            </p>
          ) : subscriptionsError ? (
            <p className="mt-4 text-sm text-destructive">{subscriptionsError}</p>
          ) : atRisk.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              All paid campaign subscriptions are healthy.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {atRisk.slice(0, 6).map(({ campaign, membership }) => {
                const organisation = organisationSubscriptions.find((item) =>
                  item.campaigns.some((entry) => entry.campaign.id === campaign.id),
                )?.organisation;
                return (
                  <li key={campaign.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{campaign.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {organisation?.name ?? "Organisation"} · {membership.activePlan.name}
                        {membership.lastPaymentAt
                          ? ` · paid ${formatDate(membership.lastPaymentAt)}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={membership.subscriptionStatus} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-semibold">Campaign subscriptions by organisation</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Current plan, capacity, billing term, and payment history for each campaign.
            </p>
          </div>
          {subscriptionsLoading && (
            <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </span>
          )}
        </div>
        {subscriptionsError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-destructive"
          >
            <span>{subscriptionsError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSubscriptionsAttempt((attempt) => attempt + 1)}
            >
              Retry
            </Button>
          </div>
        ) : !subscriptionsLoading && organisationSubscriptions.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No organisations found.</p>
        ) : (
          <div className="divide-y">
            {organisationSubscriptions.map(({ organisation, campaigns: organisationCampaigns }) => (
              <section key={organisation.id} className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <h3 className="truncate font-semibold">{organisation.name}</h3>
                    <StatusBadge status={organisation.status} />
                  </div>
                  <Link
                    to="/platform-admin/organisation/$organisationId"
                    params={{ organisationId: organisation.id }}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Organisation details
                  </Link>
                </div>
                {organisationCampaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No campaigns or subscriptions.</p>
                ) : (
                  <div className="space-y-3">
                    {organisationCampaigns.map(
                      ({ campaign, membership, startsAt, expiresAt, payments }) => {
                        const latestPayment = payments[0];
                        return (
                          <div key={campaign.id} className="rounded-xl border bg-card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <Link
                                  to="/platform-admin/organisation/$organisationId"
                                  params={{ organisationId: organisation.id }}
                                  className="font-semibold hover:text-primary"
                                >
                                  {campaign.name}
                                </Link>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {membership.activeMemberCount} active members ·{" "}
                                  {membership.maxMembers === null
                                    ? "Unlimited capacity"
                                    : `${membership.remainingCapacity} of ${membership.maxMembers} places remaining`}
                                </p>
                              </div>
                              <StatusBadge status={membership.subscriptionStatus} />
                            </div>
                            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                              <div>
                                <dt className="text-xs text-muted-foreground">Current plan</dt>
                                <dd className="mt-1 font-medium">
                                  {membership.activePlan.name} ·{" "}
                                  {membership.activePlan.code === "UNCONFIGURED"
                                    ? "Not configured"
                                    : membership.activePlan.price === null ||
                                        membership.activePlan.price === 0
                                      ? "Free"
                                      : `${formatKES(membership.activePlan.price)}/month`}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">Subscription term</dt>
                                <dd className="mt-1">
                                  {startsAt ? formatDate(startsAt) : "—"} to{" "}
                                  {expiresAt ? formatDate(expiresAt) : "—"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">
                                  Next required plan
                                </dt>
                                <dd className="mt-1">
                                  {membership.upgradeRequired
                                    ? membership.requiredPlan?.name ?? "No configured plan"
                                    : "Current plan supports next member"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">Latest payment</dt>
                                <dd className="mt-1">
                                  {latestPayment ? (
                                    <span>
                                      {formatKES(latestPayment.amount)} ·{" "}
                                      {latestPayment.paymentMethod.replace(/_/g, " ")} ·{" "}
                                      <StatusBadge status={latestPayment.status} />
                                    </span>
                                  ) : (
                                    "No payments recorded"
                                  )}
                                </dd>
                                {latestPayment && (
                                  <p className="mt-1 break-all text-xs text-muted-foreground">
                                    {latestPayment.paymentReference ||
                                      latestPayment.receipt ||
                                      "No payment reference"}
                                    {" · "}
                                    {formatDate(
                                      latestPayment.verifiedAt ?? latestPayment.createdAt,
                                    )}
                                  </p>
                                )}
                              </div>
                            </dl>
                            {payments.length > 1 && (
                              <details className="mt-4 border-t pt-3">
                                <summary className="cursor-pointer text-xs font-medium text-primary">
                                  Payment history ({payments.length})
                                </summary>
                                <ul className="mt-2 divide-y">
                                  {payments.map((payment) => (
                                    <li
                                      key={payment.id}
                                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                                    >
                                      <span>
                                        {payment.planCode} · {formatKES(payment.amount)} ·{" "}
                                        {payment.paymentMethod.replace(/_/g, " ")}
                                        {payment.paymentReference || payment.receipt
                                          ? ` · ${payment.paymentReference || payment.receipt}`
                                          : ""}
                                      </span>
                                      <span className="flex items-center gap-2">
                                        {formatDate(payment.verifiedAt ?? payment.createdAt)}
                                        <StatusBadge status={payment.status} />
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="mt-6 p-5">
        <h2 className="font-semibold">Recent platform activity</h2>
        <ul className="mt-4 divide-y">
          {audit.slice(0, 7).map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            >
              <span>
                <span className="font-medium">{event.actor}</span>{" "}
                <span className="text-muted-foreground">{event.action.replace(/[._]/g, " ")}</span>{" "}
                · {event.target}
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(event.at)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
