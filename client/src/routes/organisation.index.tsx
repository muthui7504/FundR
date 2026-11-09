import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Megaphone,
  Plus,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareCampaignButton } from "@/components/campaigns/ShareCampaignButton";
import {
  EmptyState,
  PageHeader,
  Panel,
  ProgressBar,
  StatCard,
  StatusBadge,
} from "@/components/kit";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { formatDate, formatKES, pct } from "@/utils/format";
import { meta } from "@/utils/meta";
import { api } from "@/services/api";
import type { CampaignMembershipOverview } from "@/types";

export const Route = createFileRoute("/organisation/")({
  head: () =>
    meta(
      "Organisation overview",
      "Verified funds raised, active campaigns and pledges for your organisation.",
    ),
  component: Overview,
});

function Overview() {
  const { org, campaigns, members, participants } = useDemo();
  const mine = campaigns.filter((campaign) => campaign?.orgId === org.id);
  const active = mine.filter((campaign) => campaign.status === "ACTIVE");
  const activeCampaignIds = active.map((campaign) => campaign.id);
  const activeCampaignIdSet = new Set(activeCampaignIds);
  const activeCampaignKey = activeCampaignIds.join("|");
  const [campaignMemberships, setCampaignMemberships] = useState<
    Record<string, CampaignMembershipOverview>
  >({});
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipError, setMembershipError] = useState("");
  const [membershipAttempt, setMembershipAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    const campaignIds = activeCampaignKey ? activeCampaignKey.split("|") : [];
    if (campaignIds.length === 0) {
      setCampaignMemberships({});
      setMembershipError("");
      setMembershipLoading(false);
      return () => {
        current = false;
      };
    }

    setMembershipLoading(true);
    setMembershipError("");
    void Promise.allSettled(campaignIds.map((campaignId) => api.campaigns.membership(campaignId)))
      .then((results) => {
        if (!current) return;
        const memberships: Record<string, CampaignMembershipOverview> = {};
        let failedCount = 0;
        results.forEach((result) => {
          if (result.status === "fulfilled") memberships[result.value.campaignId] = result.value;
          else failedCount += 1;
        });
        setCampaignMemberships(memberships);
        if (failedCount > 0) {
          setMembershipError(
            `Couldn’t load upgrade status for ${failedCount} active ${failedCount === 1 ? "campaign" : "campaigns"}.`,
          );
        }
      })
      .finally(() => {
        if (current) setMembershipLoading(false);
      });

    return () => {
      current = false;
    };
  }, [activeCampaignKey, membershipAttempt]);
  const raised = mine.reduce((total, campaign) => total + campaignRaised(campaign.id), 0);
  const target = mine.reduce((total, campaign) => total + campaign.target, 0);
  const totalMembers = members.filter((member) => member.status === "ACTIVE").length;
  const activeParts = new Set(
    participants
      .filter(
        (participant) =>
          participant?.status === "ACTIVE" &&
          activeCampaignIdSet.has(participant.campaignId),
      )
      .map((participant) => participant.memberId),
  ).size;
  const endingSoon = active
    .filter((campaign) => new Date(campaign.endDate).getTime() >= Date.now())
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(0, 3);
  const recentJoins = participants
    .filter(
      (participant) =>
        participant?.status === "ACTIVE" &&
        mine.some((campaign) => campaign.id === participant.campaignId),
    )
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
    .slice(0, 5);
  const memberName = (id: string) =>
    members.find((member) => member.id === id)?.name ?? "Organisation member";
  const campaignName = (id: string) =>
    mine.find((campaign) => campaign.id === id)?.name ?? "Campaign";

  return (
    <>
      <PageHeader
        title={`${org.name || "Organisation"} overview`}
        description="Track your campaigns, members and fundraising targets in one place."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/organisation/members">Invite members</Link>
            </Button>
            <Button asChild>
              <Link to="/organisation/campaigns/new">
                <Plus className="h-4 w-4" />
                New campaign
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Actual funds raised"
          value={formatKES(raised)}
          hint="Verified contributions"
          icon={<Target className="h-5 w-5" />}
        />
        <StatCard
          label="Active campaigns"
          value={String(active.length)}
          hint={`${mine.length} total`}
          icon={<Megaphone className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label="Active campaign members"
          value={`${activeParts} / ${totalMembers}`}
          hint="Members participating in active campaigns"
          icon={<Users className="h-5 w-5" />}
          tone="muted"
        />
        <StatCard
          label="Campaign targets"
          value={formatKES(target)}
          hint="Across all campaigns"
          icon={<CalendarClock className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      {(membershipLoading ||
        membershipError ||
        active.some((campaign) => campaignMemberships[campaign.id])) && (
        <Panel className="mt-6 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="font-semibold">Campaign membership plans</h2>
            <p className="text-xs text-muted-foreground">
              Campaign capacity and remaining member places.
            </p>
          </div>
          {membershipLoading && (
            <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking campaign capacity…
            </p>
          )}
          {membershipError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-destructive"
            >
              <span>{membershipError} Upgrade warnings may be incomplete.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMembershipAttempt((attempt) => attempt + 1)}
              >
                Retry
              </Button>
            </div>
          )}
          <div className="divide-y">
            {active.map((campaign) => {
              const membership = campaignMemberships[campaign.id];
              if (!membership) return null;
              const maxMembers = membership.maxMembers;
              const remaining = membership.remainingCapacity;
              const needsAttention = maxMembers !== null && remaining !== null && remaining < 10;
              const full = remaining === 0;
              const usage =
                maxMembers === null ? 0 : (membership.activeMemberCount / maxMembers) * 100;
              const statusContent = (
                <>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {needsAttention ? (
                      <AlertTriangle
                        className={`mt-0.5 h-5 w-5 shrink-0 ${full ? "text-destructive" : "text-warning"}`}
                      />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <p className="truncate font-medium">{campaign.name}</p>
                        <p
                          className={`text-sm font-semibold ${needsAttention ? (full ? "text-destructive" : "text-warning") : "text-success"}`}
                        >
                          {maxMembers === null
                            ? "Healthy · Unlimited capacity"
                            : full
                              ? "Full · 0 places remaining"
                              : needsAttention
                                ? `Low capacity · ${remaining} ${remaining === 1 ? "place" : "places"} remaining`
                                : `Healthy · ${remaining} places remaining`}
                        </p>
                      </div>
                      {maxMembers !== null && (
                        <ProgressBar
                          value={usage}
                          size="sm"
                          className={`mt-2 ${full ? "[&>div]:bg-destructive" : needsAttention ? "[&>div]:bg-warning" : "[&>div]:bg-success"}`}
                        />
                      )}
                      {needsAttention && (
                        <p className={`mt-1 text-xs ${full ? "text-destructive" : "text-warning"}`}>
                          {full
                            ? `Member limit reached on the ${membership.activePlan.name} plan. Upgrade to add members.`
                            : `Only ${remaining} places remain on the ${membership.activePlan.name} plan. Upgrade this campaign before it fills.`}
                        </p>
                      )}
                    </div>
                  </div>
                  {needsAttention && (
                    <span
                      className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${full ? "text-destructive" : "text-warning"}`}
                    >
                      Review &amp; upgrade <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </>
              );
              return needsAttention ? (
                <Link
                  key={campaign.id}
                  to="/organisation/campaigns/$campaignId"
                  params={{ campaignId: campaign.id }}
                  aria-label={`Open ${campaign.name} to upgrade its membership plan`}
                  className={`flex items-center justify-between gap-4 p-4 transition-colors ${full ? "bg-destructive/5 hover:bg-destructive/10" : "bg-warning/5 hover:bg-warning/10"}`}
                >
                  {statusContent}
                </Link>
              ) : (
                <div key={campaign.id} className="flex items-center gap-4 p-4">
                  {statusContent}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Campaign progress</h2>
              <p className="text-xs text-muted-foreground">
                Verified funds against each campaign target
              </p>
            </div>
            <Link
              to="/organisation/campaigns"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {active.length === 0 ? (
            <EmptyState
              title="No active campaigns"
              description="Campaign progress for expired or inactive campaigns is hidden here."
              action={
                <Button asChild>
                  <Link to="/organisation/campaigns/new">Create campaign</Link>
                </Button>
              }
            />
          ) : (
            <div className="mt-5 space-y-5">
              {active.slice(0, 4).map((campaign) => {
                const campaignTotal = campaignRaised(campaign.id);
                const progress = pct(campaignTotal, campaign.target);
                return (
                  <div key={campaign.id} className="rounded-2xl border border-border/70 bg-background/70 p-3.5 sm:p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <Link
                        to="/organisation/campaigns/$campaignId"
                        params={{ campaignId: campaign.id }}
                        className="min-w-0 truncate font-semibold hover:text-primary"
                      >
                        {campaign.name}
                      </Link>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {progress}%
                      </span>
                    </div>
                    <ProgressBar value={progress} size="sm" className="mt-2" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {formatKES(campaignTotal)} of {formatKES(campaign.target)}
                      </p>
                      {campaign.status === "ACTIVE" && (
                        <ShareCampaignButton
                          campaignName={campaign.name}
                          joinCode={campaign.joinCode}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel className="p-5">
          <h2 className="font-semibold">Recent joins</h2>
          <p className="text-xs text-muted-foreground">Members who joined your campaigns</p>
          {recentJoins.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              No members have joined a campaign yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentJoins.map((join) => (
                <li key={`${join.memberId}-${join.campaignId}`} className="text-sm">
                  <p className="font-medium">{memberName(join.memberId)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {campaignName(join.campaignId)} · {formatDate(join.joinedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Ending soon</h2>
          <Link
            to="/organisation/campaigns"
            className="text-sm font-medium text-primary hover:underline"
          >
            Manage campaigns
          </Link>
        </div>
        <Panel>
          {endingSoon.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No active campaigns have an upcoming end date.
            </p>
          ) : (
            <div className="divide-y">
              {endingSoon.map((campaign) => (
                <Link
                  key={campaign.id}
                  to="/organisation/campaigns/$campaignId"
                  params={{ campaignId: campaign.id }}
                  className="flex items-center justify-between gap-3 p-4 transition hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{campaign.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ends {formatDate(campaign.endDate)}
                    </p>
                  </div>
                  <StatusBadge status={campaign.status} />
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
