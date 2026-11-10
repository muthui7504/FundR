import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Download,
  FileBarChart,
  FileSpreadsheet,
  Loader2,
  Printer,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  PageHeader,
  Panel,
  ProgressBar,
  StatCard,
  StatusBadge,
} from "@/components/kit";
import { api, type CampaignMember } from "@/services/api";
import { useDemo } from "@/context/DemoStore";
import type { Campaign, Contribution, Member, Participant } from "@/types";
import { formatDate, formatKES, pct } from "@/utils/format";
import { isWithinDateRange, localDateInputValue, safeFilename, toCsv } from "@/utils/reports";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/organisation/reports")({
  head: () => meta("Reports & insights", "Download fundraising, campaign and member reports."),
  component: Reports,
});

type ReportType =
  | "summary"
  | "campaigns"
  | "contributions"
  | "members"
  | "member"
  | "member-supporters";
type ReportData = {
  organisation: { name: string };
  campaigns: Campaign[];
  members: Member[];
  participants: Participant[];
  contributions: Contribution[];
  campaignMembers: CampaignMember[];
};

const reportOptions: { value: ReportType; label: string; description: string }[] = [
  {
    value: "summary",
    label: "Summary & analysis",
    description: "A high-level snapshot with trends and key findings.",
  },
  {
    value: "campaigns",
    label: "Campaign performance",
    description: "Targets, verified funds, progress and active members.",
  },
  {
    value: "contributions",
    label: "Contribution ledger",
    description: "A detailed record of gifts and payment statuses.",
  },
  {
    value: "members",
    label: "Member engagement",
    description: "Campaign participation and member contact details.",
  },
  {
    value: "member",
    label: "Member fundraising & supporters",
    description: "A selected member’s fundraising pages and their contributors.",
  },
  {
    value: "member-supporters",
    label: "All members & supporters",
    description: "Every member with their fundraising supporters listed underneath.",
  },
];

const statusOrder = ["COMPLETED", "PENDING", "FAILED", "REVERSED", "REFUNDED"] as const;
const emptyCampaigns: Campaign[] = [];

function Reports() {
  const { org, setCampaigns, setMembers, setParticipants, setContributions } = useDemo();
  const today = localDateInputValue(new Date());
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const [startDate, setStartDate] = useState(localDateInputValue(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(today);
  const [campaignId, setCampaignId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [reportType, setReportType] = useState<ReportType>("summary");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const dashboard = await api.organisations.dashboard();
      const campaignMembers = (
        await Promise.all(dashboard.campaigns.map((campaign) => api.campaigns.members(campaign.id)))
      ).flat();
      setData({ ...dashboard, campaignMembers });
      setCampaigns(dashboard.campaigns);
      setMembers(dashboard.members);
      setParticipants(dashboard.participants);
      setContributions(dashboard.contributions);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Unable to load report data.");
    } finally {
      setLoading(false);
    }
  }, [setCampaigns, setContributions, setMembers, setParticipants]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const campaigns = data?.campaigns ?? emptyCampaigns;
  const membersById = useMemo(
    () => new Map((data?.members ?? []).map((member) => [member.id, member])),
    [data?.members],
  );
  const campaignsById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign])),
    [campaigns],
  );
  const scopedContributions = useMemo(
    () =>
      (data?.contributions ?? []).filter(
        (contribution) =>
          (!campaignId || contribution.campaignId === campaignId) &&
          isWithinDateRange(contribution.createdAt, startDate, endDate),
      ),
    [campaignId, data?.contributions, endDate, startDate],
  );
  const completedContributions = scopedContributions.filter((item) => item.status === "COMPLETED");
  const totalRaised = completedContributions.reduce((sum, item) => sum + item.amount, 0);
  const averageGift = completedContributions.length
    ? totalRaised / completedContributions.length
    : 0;
  const largestGift = completedContributions.reduce(
    (largest, item) => Math.max(largest, item.amount),
    0,
  );
  const completionRate = scopedContributions.length
    ? Math.round((completedContributions.length / scopedContributions.length) * 100)
    : 0;
  const activeCampaignCount = campaigns.filter(
    (campaign) => campaign.status === "ACTIVE" && (!campaignId || campaign.id === campaignId),
  ).length;
  const membersJoined = campaignId
    ? new Set(
        (data?.participants ?? [])
          .filter(
            (participant) =>
              participant.campaignId === campaignId &&
              participant.status === "ACTIVE" &&
              isWithinDateRange(participant.joinedAt, startDate, endDate),
          )
          .map((participant) => participant.memberId),
      ).size
    : (data?.members ?? []).filter(
        (member) =>
          member.status === "ACTIVE" && isWithinDateRange(member.joinedAt, startDate, endDate),
      ).length;

  const campaignRows = campaigns
    .filter((campaign) => !campaignId || campaign.id === campaignId)
    .map((campaign) => {
      const periodRaised = scopedContributions
        .filter(
          (contribution) =>
            contribution.campaignId === campaign.id && contribution.status === "COMPLETED",
        )
        .reduce((sum, contribution) => sum + contribution.amount, 0);
      const lifetimeRaised = (data?.contributions ?? [])
        .filter(
          (contribution) =>
            contribution.campaignId === campaign.id && contribution.status === "COMPLETED",
        )
        .reduce((sum, contribution) => sum + contribution.amount, 0);
      const activeMembers = new Set(
        (data?.participants ?? [])
          .filter(
            (participant) =>
              participant.campaignId === campaign.id && participant.status === "ACTIVE",
          )
          .map((participant) => participant.memberId),
      ).size;
      return { campaign, periodRaised, lifetimeRaised, activeMembers };
    })
    .sort((a, b) => b.periodRaised - a.periodRaised);

  const memberRows = (data?.participants ?? [])
    .filter(
      (participant) =>
        (!campaignId || participant.campaignId === campaignId) &&
        isWithinDateRange(participant.joinedAt, startDate, endDate),
    )
    .map((participant) => ({
      participant,
      member: membersById.get(participant.memberId),
      campaign: campaignsById.get(participant.campaignId),
    }))
    .sort((a, b) => b.participant.joinedAt.localeCompare(a.participant.joinedAt));
  const reportMembers = useMemo(() => {
    const profilesByMember = new Map<string, Member>();
    for (const item of data?.campaignMembers ?? []) {
      if ((!campaignId || item.participant.campaignId === campaignId) && item.profile)
        profilesByMember.set(item.member.id, item.member);
    }
    return Array.from(profilesByMember.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [campaignId, data?.campaignMembers]);
  const selectedMember = reportMembers.find((member) => member.id === memberId);
  const selectedMemberPages = (data?.campaignMembers ?? []).filter(
    (item) =>
      item.member.id === memberId &&
      item.profile &&
      (!campaignId || item.participant.campaignId === campaignId),
  );
  const selectedProfileIds = new Set(
    selectedMemberPages.map((item) => item.profile?.id).filter((id): id is string => Boolean(id)),
  );
  const memberContributions = (data?.contributions ?? [])
    .filter(
      (contribution) =>
        selectedProfileIds.has(contribution.profileId) &&
        isWithinDateRange(contribution.createdAt, startDate, endDate),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const memberCompletedContributions = memberContributions.filter(
    (contribution) => contribution.status === "COMPLETED",
  );
  const memberRaised = memberCompletedContributions.reduce(
    (sum, contribution) => sum + contribution.amount,
    0,
  );
  const memberSupporters = new Set(
    memberCompletedContributions.map((contribution) =>
      contribution.phone ? contribution.phone : contribution.supporterName || contribution.id,
    ),
  );
  const memberSupporterGroups = useMemo(() => {
    const campaignMemberIds = new Set(
      (data?.participants ?? [])
        .filter((participant) => !campaignId || participant.campaignId === campaignId)
        .map((participant) => participant.memberId),
    );
    for (const item of data?.campaignMembers ?? []) {
      if (!campaignId || item.participant.campaignId === campaignId)
        campaignMemberIds.add(item.member.id);
    }
    const profilesByMember = new Map<string, Set<string>>();
    const memberByProfileId = new Map<string, string>();
    for (const item of data?.campaignMembers ?? []) {
      if ((!campaignId || item.participant.campaignId === campaignId) && item.profile) {
        const profileIds = profilesByMember.get(item.member.id) ?? new Set<string>();
        profileIds.add(item.profile.id);
        profilesByMember.set(item.member.id, profileIds);
        memberByProfileId.set(item.profile.id, item.member.id);
      }
    }
    const contributionsByMember = new Map<string, Contribution[]>();
    for (const member of data?.members ?? []) contributionsByMember.set(member.id, []);
    for (const contribution of data?.contributions ?? []) {
      const memberId = memberByProfileId.get(contribution.profileId);
      if (
        memberId &&
        (!campaignId || contribution.campaignId === campaignId) &&
        isWithinDateRange(contribution.createdAt, startDate, endDate)
      ) {
        contributionsByMember.get(memberId)?.push(contribution);
      }
    }

    return (data?.members ?? [])
      .filter((member) => !campaignId || campaignMemberIds.has(member.id))
      .map((member) => {
        const profileIds = profilesByMember.get(member.id) ?? new Set<string>();
        const contributions = (contributionsByMember.get(member.id) ?? []).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        const completedContributions = contributions.filter(
          (contribution) => contribution.status === "COMPLETED",
        );
        const supporters = new Set(
          completedContributions.map((contribution) =>
            contribution.phone
              ? contribution.phone
              : contribution.supporterName || contribution.id,
          ),
        );
        return {
          member,
          contributions,
          completedContributions,
          supporters,
          raised: completedContributions.reduce((sum, contribution) => sum + contribution.amount, 0),
          pageCount: profileIds.size,
        };
      })
      .sort((a, b) => a.member.name.localeCompare(b.member.name));
  }, [
    campaignId,
    data?.campaignMembers,
    data?.contributions,
    data?.members,
    data?.participants,
    endDate,
    startDate,
  ]);
  const allMemberRaised = memberSupporterGroups.reduce((sum, group) => sum + group.raised, 0);
  const allMemberContributions = memberSupporterGroups.reduce(
    (sum, group) => sum + group.contributions.length,
    0,
  );
  const allMemberSupporters = new Set(
    memberSupporterGroups.flatMap((group) =>
      group.completedContributions.map((contribution) =>
        contribution.phone ? contribution.phone : contribution.supporterName || contribution.id,
      ),
    ),
  );

  const trend = useMemo(
    () => createTrend(scopedContributions, startDate, endDate),
    [endDate, scopedContributions, startDate],
  );
  const topCampaign = campaignRows[0];
  const reportTitle =
    reportOptions.find((option) => option.value === reportType)?.label ?? "Report";
  const organisationName = data?.organisation.name || org.name || "Your organisation";

  const setPeriod = (preset: "month" | "year" | "all") => {
    const now = new Date();
    setEndDate(localDateInputValue(now));
    if (preset === "all") setStartDate("");
    else if (preset === "year") setStartDate(`${now.getFullYear()}-01-01`);
    else {
      now.setDate(now.getDate() - 29);
      setStartDate(localDateInputValue(now));
    }
  };

  const reportRows = (): (string | number | null | undefined)[][] => {
    const periodLabel = `${startDate || "All time"} to ${endDate || "Present"}`;
    if (reportType === "campaigns") {
      return [
        [
          "Campaign",
          "Status",
          "Target (KSh)",
          "Raised in period (KSh)",
          "Lifetime verified (KSh)",
          "Lifetime progress (%)",
          "Active members",
        ],
        ...campaignRows.map(({ campaign, periodRaised, lifetimeRaised, activeMembers }) => [
          campaign.name,
          campaign.status,
          campaign.target,
          periodRaised,
          lifetimeRaised,
          pct(lifetimeRaised, campaign.target),
          activeMembers,
        ]),
      ];
    }
    if (reportType === "contributions") {
      return [
        ["Date", "Campaign", "Supporter", "Phone", "Amount (KSh)", "Status", "Receipt"],
        ...scopedContributions
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((contribution) => [
            formatDate(contribution.createdAt),
            campaignsById.get(contribution.campaignId)?.name ?? "Unknown campaign",
            contribution.supporterName || "Anonymous supporter",
            contribution.phone,
            contribution.amount,
            contribution.status,
            contribution.receipt ?? "",
          ]),
      ];
    }
    if (reportType === "members") {
      return [
        ["Member", "Email", "Phone", "Campaign", "Participation status", "Joined campaign"],
        ...memberRows.map(({ participant, member, campaign }) => [
          member?.name ?? "Unknown member",
          member?.email ?? "",
          member?.phone ?? "",
          campaign?.name ?? "Unknown campaign",
          participant.status,
          formatDate(participant.joinedAt),
        ]),
      ];
    }
    if (reportType === "member") {
      return [
        ["Member fundraising report", "Value"],
        ["Member", selectedMember?.name ?? "Select a member"],
        ["Email", selectedMember?.email ?? ""],
        ["Phone", selectedMember?.phone ?? ""],
        ["Reporting period", periodLabel],
        ["Campaign filter", campaignsById.get(campaignId)?.name ?? "All campaigns"],
        ["Fundraising pages", selectedMemberPages.length],
        ["Verified funds raised (KSh)", memberRaised],
        ["Verified contributions", memberCompletedContributions.length],
        ["Unique supporters", memberSupporters.size],
        [],
        [
          "Supporter",
          "Phone",
          "Amount (KSh)",
          "Status",
          "Date",
          "Receipt",
        ],
        ...memberContributions.map((contribution) => [
          contribution.supporterName || "Anonymous supporter",
          contribution.phone,
          contribution.amount,
          contribution.status,
          formatDate(contribution.createdAt),
          contribution.receipt ?? "",
        ]),
      ];
    }
    if (reportType === "member-supporters") {
      return [
        [
          "Member",
          "Member email",
          "Member phone",
          "Member status",
          "Supporter",
          "Supporter phone",
          "Amount (KSh)",
          "Payment status",
          "Date",
          "Receipt",
        ],
        ...memberSupporterGroups.flatMap((group) =>
          group.contributions.length
            ? group.contributions.map((contribution) => [
                group.member.name,
                group.member.email,
                group.member.phone,
                group.member.status,
                contribution.supporterName || "Anonymous supporter",
                contribution.phone,
                contribution.amount,
                contribution.status,
                formatDate(contribution.createdAt),
                contribution.receipt ?? "",
              ])
            : [
                [
                  group.member.name,
                  group.member.email,
                  group.member.phone,
                  group.member.status,
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                ],
              ],
        ),
      ];
    }
    return [
      ["Fundraising summary", "Value"],
      ["Organisation", organisationName],
      ["Reporting period", periodLabel],
      ["Campaign filter", campaignsById.get(campaignId)?.name ?? "All campaigns"],
      ["Verified funds raised (KSh)", totalRaised],
      ["Completed contributions", completedContributions.length],
      ["All payment attempts", scopedContributions.length],
      ["Completion rate (%)", completionRate],
      ["Average completed gift (KSh)", Math.round(averageGift)],
      ["Largest completed gift (KSh)", largestGift],
      ["Active campaigns", activeCampaignCount],
      [
        campaignId
          ? "Active campaign members joined in period"
          : "Active organisation members joined in period",
        membersJoined,
      ],
      ["Top campaign by period funds", topCampaign?.campaign.name ?? "No contributions"],
      ["Top campaign funds in period (KSh)", topCampaign?.periodRaised ?? 0],
    ];
  };

  const downloadCsv = () => {
    if (invalidRange || loading || !data || (reportType === "member" && !selectedMember)) return;
    try {
      const content = `\uFEFF${toCsv(reportRows())}`;
      const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const period = `${startDate || "all-time"}-${endDate || "present"}`;
      link.href = href;
      link.download = `${safeFilename(organisationName) || "fundr"}-${reportType}-${period}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Unable to download this report.");
    }
  };

  const printReport = () => {
    if (invalidRange || loading || !data || (reportType === "member" && !selectedMember)) return;
    const cleanup = () => document.body.classList.remove("reports-export");
    document.body.classList.add("reports-export");
    window.addEventListener("afterprint", cleanup, { once: true });
    try {
      window.print();
    } catch (cause) {
      cleanup();
      window.removeEventListener("afterprint", cleanup);
      setErrorMessage(cause instanceof Error ? cause.message : "Unable to open the print dialog.");
    }
  };

  return (
    <>
      <div className="reports-no-print">
        <PageHeader
          title="Reports & insights"
          description="Explore your organisation’s fundraising performance and download reports for sharing or record-keeping."
          actions={
            <>
              <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={printReport}
                disabled={loading || !data || invalidRange || (reportType === "member" && !selectedMember)}
              >
                <Printer className="h-4 w-4" />
                Print / save PDF
              </Button>
              <Button
                onClick={downloadCsv}
                disabled={loading || !data || invalidRange || (reportType === "member" && !selectedMember)}
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </>
          }
        />
        <Panel className="mb-6 p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
            <label className="text-sm font-medium">
              Report
              <select
                className="mt-1.5 h-11 w-full rounded-xl border bg-card px-3 text-sm"
                value={reportType}
                onChange={(event) => setReportType(event.target.value as ReportType)}
              >
                {reportOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {reportOptions.find((option) => option.value === reportType)?.description}
              </span>
            </label>
            <label className="text-sm font-medium">
              From
              <input
                className="mt-1.5 h-11 w-full rounded-xl border bg-card px-3 text-sm"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              To
              <input
                className="mt-1.5 h-11 w-full rounded-xl border bg-card px-3 text-sm"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium">
              Campaign
              <select
                className="mt-1.5 h-11 w-full rounded-xl border bg-card px-3 text-sm"
                value={campaignId}
                onChange={(event) => {
                  setCampaignId(event.target.value);
                  setMemberId("");
                }}
              >
                <option value="">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
            {reportType === "member" && (
              <label className="text-sm font-medium">
                Member
                <select
                  className="mt-1.5 h-11 w-full rounded-xl border bg-card px-3 text-sm"
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                >
                  <option value="">Select a member</option>
                  {reportMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}{member.email ? ` · ${member.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground">Quick range:</span>
            <Button size="sm" variant="outline" onClick={() => setPeriod("month")}>
              Last 30 days
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPeriod("year")}>
              This year
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPeriod("all")}>
              All time
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              PDF export opens your browser’s print dialog; choose “Save as PDF”.
            </span>
          </div>
          {invalidRange && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              The start date must be on or before the end date.
            </p>
          )}
        </Panel>
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
          >
            <span>
              {data
                ? "Couldn’t refresh report data; showing the last successful snapshot."
                : "Couldn’t load report data."}{" "}
              {errorMessage}
            </span>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              Try again
            </Button>
          </div>
        )}
      </div>
      {loading && !data ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your organisation’s reports…
        </div>
      ) : !data ? (
        <Panel>
          <EmptyState
            title="Reports are unavailable"
            description="Refresh the report data to try again."
          />
        </Panel>
      ) : (
        <div className="report-print">
          <div className="mb-5 rounded-2xl border border-primary/15 bg-gradient-to-br from-card to-primary-soft/40 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                <FileBarChart className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  FundR report
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                  {reportTitle}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{organisationName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Period: {startDate ? formatDate(startDate) : "All time"} –{" "}
                  {endDate ? formatDate(endDate) : "Present"}
                  {campaignId
                    ? ` · ${campaignsById.get(campaignId)?.name ?? "Selected campaign"}`
                    : " · All campaigns"}
                  {reportType === "member" && selectedMember
                    ? ` · Member: ${selectedMember.name}`
                    : ""}
                </p>
              </div>
              <p className="hidden text-right text-xs text-muted-foreground sm:block">
                Generated {formatDate(new Date().toISOString())}
              </p>
            </div>
          </div>

          {reportType === "summary" && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="Verified funds"
                  value={formatKES(totalRaised)}
                  hint="Completed contributions in period"
                  icon={<BarChart3 className="size-5" />}
                />
                <StatCard
                  label="Successful gifts"
                  value={String(completedContributions.length)}
                  hint={`${scopedContributions.length} payment attempts`}
                  icon={<FileSpreadsheet className="size-5" />}
                  tone="info"
                />
                <StatCard
                  label="Completion rate"
                  value={`${completionRate}%`}
                  hint="Completed / all attempts"
                  icon={<BarChart3 className="size-5" />}
                  tone="muted"
                />
                <StatCard
                  label="Average gift"
                  value={formatKES(averageGift)}
                  hint={`Largest: ${formatKES(largestGift)}`}
                  icon={<BarChart3 className="size-5" />}
                  tone="warning"
                />
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
                <Panel className="p-5">
                  <h3 className="font-semibold">Funds raised over time</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Verified contributions grouped across the selected period.
                  </p>
                  {trend.length ? (
                    <div
                      className="mt-5 flex h-48 items-end gap-2 sm:gap-3"
                      role="img"
                      aria-label="Bar chart of verified funds raised across the selected date range"
                    >
                      {trend.map((item) => (
                        <div
                          key={item.label}
                          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                        >
                          <span className="max-w-full truncate text-[0.65rem] font-medium tabular-nums text-muted-foreground">
                            {item.amount ? formatKES(item.amount) : "—"}
                          </span>
                          <div
                            className="w-full max-w-12 rounded-t-lg bg-primary/80 transition-[height] print:bg-primary"
                            style={{
                              height: `${item.amount ? Math.max(5, (item.amount / Math.max(...trend.map((point) => point.amount))) * 100) : 2}%`,
                            }}
                            title={`${item.label}: ${formatKES(item.amount)}`}
                          />
                          <span className="text-[0.65rem] text-muted-foreground">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No completed contributions in this period.
                    </p>
                  )}
                </Panel>
                <Panel className="p-5">
                  <h3 className="font-semibold">At a glance</h3>
                  <div className="mt-4 divide-y">
                    <Insight
                      label="Leading campaign"
                      value={topCampaign?.campaign.name ?? "No contributions yet"}
                      note={
                        topCampaign
                          ? `${formatKES(topCampaign.periodRaised)} raised in period`
                          : "Try a wider date range"
                      }
                    />
                    <Insight
                      label="Active campaigns"
                      value={String(activeCampaignCount)}
                      note="Currently accepting contributions"
                    />
                    <Insight
                      label="Members joined"
                      value={String(membersJoined)}
                      note={
                        campaignId
                          ? "Active campaign members joined in period"
                          : "Active organisation members in period"
                      }
                    />
                    <Insight
                      label="Payment outcomes"
                      value={`${completedContributions.length} successful`}
                      note={
                        statusOrder
                          .filter((status) => status !== "COMPLETED")
                          .map((status) => {
                            const count = scopedContributions.filter(
                              (item) => item.status === status,
                            ).length;
                            return count ? `${count} ${status.toLowerCase()}` : "";
                          })
                          .filter(Boolean)
                          .join(" · ") || "No unsuccessful or pending attempts"
                      }
                    />
                  </div>
                </Panel>
              </div>
              <Panel className="mt-5 overflow-hidden">
                <ReportSectionTitle
                  title="Campaign performance"
                  description="Funds raised during the selected period, alongside lifetime goal progress."
                />
                <CampaignTable rows={campaignRows} />
              </Panel>
            </>
          )}

          {reportType === "campaigns" && (
            <Panel className="overflow-hidden">
              <ReportSectionTitle
                title="Campaign performance"
                description="Compare period fundraising against verified lifetime progress and campaign targets."
              />
              <CampaignTable rows={campaignRows} />
            </Panel>
          )}

          {reportType === "contributions" && (
            <Panel className="overflow-hidden">
              <ReportSectionTitle
                title="Contribution ledger"
                description={`${scopedContributions.length} payment ${scopedContributions.length === 1 ? "record" : "records"} · ${formatKES(totalRaised)} verified`}
              />
              <div className="overflow-x-auto">
                {scopedContributions.length ? (
                  <table className="w-full min-w-[780px] text-left text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {[
                          "Date",
                          "Campaign",
                          "Supporter",
                          "Phone",
                          "Amount",
                          "Status",
                          "Receipt",
                        ].map((heading) => (
                          <th key={heading} className="p-3 sm:p-4">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scopedContributions
                        .slice()
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                        .map((item) => (
                          <tr key={item.id}>
                            <td className="whitespace-nowrap p-3 sm:p-4">
                              {formatDate(item.createdAt)}
                            </td>
                            <td className="max-w-48 truncate p-3 sm:p-4">
                              {campaignsById.get(item.campaignId)?.name ?? "Unknown campaign"}
                            </td>
                            <td className="p-3 sm:p-4">
                              {item.supporterName || "Anonymous supporter"}
                            </td>
                            <td className="whitespace-nowrap p-3 sm:p-4">{item.phone || "—"}</td>
                            <td className="whitespace-nowrap p-3 font-semibold tabular-nums sm:p-4">
                              {formatKES(item.amount)}
                            </td>
                            <td className="p-3 sm:p-4">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="p-3 sm:p-4">{item.receipt || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState
                    title="No contributions in this period"
                    description="Try adjusting the dates or campaign filter."
                  />
                )}
              </div>
            </Panel>
          )}

          {reportType === "members" && (
            <Panel className="overflow-hidden">
              <ReportSectionTitle
                title="Member engagement"
                description={`${memberRows.length} campaign ${memberRows.length === 1 ? "membership" : "memberships"} joined during the selected period.`}
              />
              <div className="overflow-x-auto">
                {memberRows.length ? (
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {["Member", "Email", "Phone", "Campaign", "Status", "Joined"].map(
                          (heading) => (
                            <th key={heading} className="p-3 sm:p-4">
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {memberRows.map(({ participant, member, campaign }, index) => (
                        <tr key={`${participant.campaignId}-${participant.memberId}-${index}`}>
                          <td className="p-3 font-medium sm:p-4">
                            {member?.name ?? "Unknown member"}
                          </td>
                          <td className="p-3 sm:p-4">{member?.email || "—"}</td>
                          <td className="p-3 sm:p-4">{member?.phone || "—"}</td>
                          <td className="p-3 sm:p-4">{campaign?.name ?? "Unknown campaign"}</td>
                          <td className="p-3 sm:p-4">
                            <StatusBadge status={participant.status} />
                          </td>
                          <td className="whitespace-nowrap p-3 sm:p-4">
                            {formatDate(participant.joinedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState
                    title="No campaign memberships in this period"
                    description="Try adjusting the dates or campaign filter."
                    action={<Users className="size-5 text-muted-foreground" />}
                  />
                )}
              </div>
            </Panel>
          )}

          {reportType === "member-supporters" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="Members"
                  value={String(memberSupporterGroups.length)}
                  hint="In the selected organisation or campaign"
                  icon={<Users className="size-5" />}
                />
                <StatCard
                  label="Verified funds"
                  value={formatKES(allMemberRaised)}
                  hint="Completed contributions in period"
                  icon={<BarChart3 className="size-5" />}
                />
                <StatCard
                  label="Payment records"
                  value={String(allMemberContributions)}
                  hint="Across all listed member pages"
                  icon={<FileSpreadsheet className="size-5" />}
                  tone="info"
                />
                <StatCard
                  label="Unique supporters"
                  value={String(allMemberSupporters.size)}
                  hint="Verified supporters across members"
                  icon={<Users className="size-5" />}
                  tone="muted"
                />
              </div>
              <Panel className="overflow-hidden">
                <ReportSectionTitle
                  title="Members and their supporters"
                  description="Each organisation member is listed, with payment records from their fundraising pages nested below. Members with no contributions are included."
                />
                {memberSupporterGroups.length ? (
                  <div className="space-y-4 p-4 sm:p-5">
                    {memberSupporterGroups.map((group) => (
                      <section
                        key={group.member.id}
                        className="overflow-hidden rounded-2xl border bg-card"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 p-4">
                          <div className="min-w-0">
                            <h4 className="font-semibold">{group.member.name}</h4>
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                              {[group.member.email, group.member.phone].filter(Boolean).join(" · ") ||
                                "No contact details"}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <StatusBadge status={group.member.status} />
                              <span className="text-xs text-muted-foreground">
                                {group.pageCount} fundraising{" "}
                                {group.pageCount === 1 ? "page" : "pages"}
                              </span>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="font-semibold tabular-nums">{formatKES(group.raised)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {group.supporters.size} verified{" "}
                              {group.supporters.size === 1 ? "supporter" : "supporters"}
                            </p>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          {group.contributions.length ? (
                            <table className="w-full min-w-[660px] text-left text-sm">
                              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  {["Supporter", "Phone", "Amount", "Status", "Date", "Receipt"].map(
                                    (heading) => (
                                      <th key={heading} className="p-3 sm:p-4">
                                        {heading}
                                      </th>
                                    ),
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {group.contributions.map((contribution) => (
                                  <tr key={contribution.id}>
                                    <td className="p-3 sm:p-4">
                                      {contribution.supporterName || "Anonymous supporter"}
                                    </td>
                                    <td className="whitespace-nowrap p-3 sm:p-4">
                                      {contribution.phone || "—"}
                                    </td>
                                    <td className="whitespace-nowrap p-3 font-semibold tabular-nums sm:p-4">
                                      {formatKES(contribution.amount)}
                                    </td>
                                    <td className="p-3 sm:p-4">
                                      <StatusBadge status={contribution.status} />
                                    </td>
                                    <td className="whitespace-nowrap p-3 sm:p-4">
                                      {formatDate(contribution.createdAt)}
                                    </td>
                                    <td className="p-3 sm:p-4">{contribution.receipt || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="px-4 py-5 text-sm text-muted-foreground">
                              No contributions in this period.
                            </p>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No members found"
                    description="No members match the selected campaign."
                    action={<Users className="size-5 text-muted-foreground" />}
                  />
                )}
              </Panel>
            </div>
          )}

          {reportType === "member" && (
            <div className="space-y-5">
              {!selectedMember ? (
                <Panel>
                  <EmptyState
                    title="Select a member"
                    description={
                      reportMembers.length
                        ? "Choose a member with a fundraising page to see their supporters and contributions."
                        : "No members with fundraising pages match this campaign filter."
                    }
                    action={<Users className="size-5 text-muted-foreground" />}
                  />
                </Panel>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard
                      label="Verified funds"
                      value={formatKES(memberRaised)}
                      hint="Completed contributions in period"
                      icon={<BarChart3 className="size-5" />}
                    />
                    <StatCard
                      label="Contributions"
                      value={String(memberCompletedContributions.length)}
                      hint="Verified gifts in period"
                      icon={<FileSpreadsheet className="size-5" />}
                      tone="info"
                    />
                    <StatCard
                      label="Supporters"
                      value={String(memberSupporters.size)}
                      hint="Unique verified contributors"
                      icon={<Users className="size-5" />}
                      tone="muted"
                    />
                  </div>
                  <Panel className="overflow-hidden">
                    <ReportSectionTitle
                      title={`${selectedMember.name} · supporters & contributions`}
                      description={`${selectedMemberPages.length} fundraising ${selectedMemberPages.length === 1 ? "page" : "pages"} · ${memberContributions.length} payment ${memberContributions.length === 1 ? "record" : "records"} in the selected period`}
                    />
                    <div className="overflow-x-auto">
                      {memberContributions.length ? (
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              {[
                                "Supporter",
                                "Phone",
                                "Amount",
                                "Status",
                                "Date",
                                "Receipt",
                              ].map((heading) => (
                                <th key={heading} className="p-3 sm:p-4">
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {memberContributions.map((contribution) => {
                              return (
                                <tr key={contribution.id}>
                                  <td className="p-3 sm:p-4">
                                    {contribution.supporterName || "Anonymous supporter"}
                                  </td>
                                  <td className="whitespace-nowrap p-3 sm:p-4">
                                    {contribution.phone || "—"}
                                  </td>
                                  <td className="whitespace-nowrap p-3 font-semibold tabular-nums sm:p-4">
                                    {formatKES(contribution.amount)}
                                  </td>
                                  <td className="p-3 sm:p-4">
                                    <StatusBadge status={contribution.status} />
                                  </td>
                                  <td className="whitespace-nowrap p-3 sm:p-4">
                                    {formatDate(contribution.createdAt)}
                                  </td>
                                  <td className="p-3 sm:p-4">{contribution.receipt || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <EmptyState
                          title="No contributions in this period"
                          description="This member has no payment records for their fundraising pages in the selected dates and campaign."
                        />
                      )}
                    </div>
                  </Panel>
                </>
              )}
            </div>
          )}
          <p className="reports-screen-only mt-4 text-right text-xs text-muted-foreground">
            Prepared by FundR · {formatDate(new Date().toISOString())}
          </p>
        </div>
      )}
    </>
  );
}

function Insight({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </div>
      <p className="text-right text-sm font-semibold">{value}</p>
    </div>
  );
}

function ReportSectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b p-4 sm:p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function CampaignTable({
  rows,
}: {
  rows: {
    campaign: Campaign;
    periodRaised: number;
    lifetimeRaised: number;
    activeMembers: number;
  }[];
}) {
  if (!rows.length)
    return <EmptyState title="No campaigns found" description="Try another campaign filter." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {["Campaign", "Status", "Raised in period", "Lifetime progress", "Active members"].map(
              (heading) => (
                <th key={heading} className="p-3 sm:p-4">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(({ campaign, periodRaised, lifetimeRaised, activeMembers }) => (
            <tr key={campaign.id}>
              <td className="p-3 font-semibold sm:p-4">{campaign.name}</td>
              <td className="p-3 sm:p-4">
                <StatusBadge status={campaign.status} />
              </td>
              <td className="p-3 font-medium tabular-nums sm:p-4">{formatKES(periodRaised)}</td>
              <td className="min-w-48 p-3 sm:p-4">
                <div className="flex justify-between gap-3 text-xs">
                  <span>
                    {formatKES(lifetimeRaised)} / {formatKES(campaign.target)}
                  </span>
                  <span>{pct(lifetimeRaised, campaign.target)}%</span>
                </div>
                <ProgressBar
                  size="sm"
                  value={pct(lifetimeRaised, campaign.target)}
                  className="mt-2"
                />
              </td>
              <td className="p-3 tabular-nums sm:p-4">{activeMembers}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function createTrend(contributions: Contribution[], startDate: string, endDate: string) {
  if (startDate && endDate && startDate > endDate) return [];
  const completed = contributions.filter((contribution) => contribution.status === "COMPLETED");
  if (!completed.length) return [];
  const times = completed.map((contribution) =>
    Date.parse(`${contribution.createdAt.slice(0, 10)}T00:00:00Z`),
  );
  const start = startDate ? Date.parse(`${startDate}T00:00:00Z`) : Math.min(...times);
  const end = endDate ? Date.parse(`${endDate}T00:00:00Z`) : Math.max(Date.now(), ...times);
  const day = 24 * 60 * 60 * 1000;
  const span = Math.max(day, end - start + day);
  const bucketCount = Math.min(6, Math.max(1, Math.ceil(span / (7 * day))));
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const from = start + Math.floor((span * index) / bucketCount);
    const to = start + Math.floor((span * (index + 1)) / bucketCount) - day;
    return {
      from,
      to: Math.max(from, to),
      label: new Intl.DateTimeFormat("en-KE", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(from)),
      amount: 0,
    };
  });
  for (const contribution of completed) {
    const time = Date.parse(`${contribution.createdAt.slice(0, 10)}T00:00:00Z`);
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor(((time - start) / span) * bucketCount)),
    );
    if (time >= start && time < end + day) buckets[index].amount += contribution.amount;
  }
  return buckets;
}
