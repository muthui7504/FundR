import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownUp,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  Megaphone,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  FilterChips,
  PageHeader,
  Pagination,
  Panel,
  ProgressBar,
  SearchInput,
  StatusBadge,
  inputCls,
  usePaged,
} from "@/components/kit";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { api } from "@/services/api";
import { formatDate, formatKES, pct } from "@/utils/format";
import { meta } from "@/utils/meta";
import type { Campaign } from "@/types";

export const Route = createFileRoute("/organisation/campaigns/")({
  head: () =>
    meta("Campaigns", "Create, search and manage your organisation's fundraising campaigns."),
  component: Campaigns,
});

const STATUSES = ["ALL", "DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;

function Campaigns() {
  const { campaigns, participants, org, setCampaigns, setParticipants, setContributions } =
    useDemo();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError("");
    try {
      const dashboard = await api.organisations.dashboard();
      setCampaigns(dashboard.campaigns);
      setParticipants(dashboard.participants);
      setContributions(dashboard.contributions);
    } catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : "Unable to refresh campaign data.");
    } finally {
      setRefreshing(false);
    }
  }, [setCampaigns, setParticipants, setContributions]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const [q, setQ] = useState("");
  const [st, setSt] = useState<(typeof STATUSES)[number]>("ALL");
  const [sort, setSort] = useState("newest");
  const rows = useMemo(() => {
    const r = campaigns.filter(
      (c) =>
        c.orgId === org.id &&
        (st === "ALL" || c.status === st) &&
        c.name.toLowerCase().includes(q.toLowerCase()),
    );
    return [...r].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "raised"
          ? campaignRaised(b.id) - campaignRaised(a.id)
          : b.startDate.localeCompare(a.startDate),
    );
  }, [campaigns, org.id, q, st, sort]);
  const pg = usePaged(rows, 6);
  const count = (id: string) =>
    participants.filter((p) => p.campaignId === id && p.status === "ACTIVE").length;
  const mine = campaigns.filter((campaign) => campaign.orgId === org.id);
  const activeCount = mine.filter((campaign) => campaign.status === "ACTIVE").length;
  const totalRaised = mine.reduce((total, campaign) => total + campaignRaised(campaign.id), 0);
  const totalTarget = mine.reduce((total, campaign) => total + campaign.target, 0);
  return (
    <>
      <PageHeader
        title="Campaigns"
        description={`All fundraising campaigns for ${org.name || "your organisation"}.`}
        actions={
          <Button asChild>
            <Link to="/organisation/campaigns/new">
              <Plus className="h-4 w-4" />
              Create campaign
            </Link>
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<Megaphone className="size-5" />}
          label="Total campaigns"
          value={String(mine.length)}
          note="Across your organisation"
          tone="green"
        />
        <SummaryCard
          icon={<CheckCircle2 className="size-5" />}
          label="Currently active"
          value={String(activeCount)}
          note={activeCount ? "Making an impact right now" : "No active campaigns"}
          tone="blue"
        />
        <SummaryCard
          icon={<CircleDollarSign className="size-5" />}
          label="Verified funds raised"
          value={formatKES(totalRaised)}
          note={`of ${formatKES(totalTarget)} in total targets`}
          tone="gold"
        />
      </div>
      <Panel className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput value={q} onChange={setQ} placeholder="Search campaigns" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <FilterChips options={STATUSES} value={st} onChange={setSt} />
              <label className="relative block sm:w-44">
                <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  aria-label="Sort campaigns"
                  className={inputCls + " h-10 w-full pl-9"}
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="name">Campaign name</option>
                  <option value="raised">Most raised</option>
                </select>
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{rows.length}</span>{" "}
              {rows.length === 1 ? "campaign" : "campaigns"}
              {st !== "ALL" ? ` · ${st.toLowerCase()}` : ""}
              {q.trim() ? ` matching “${q.trim()}”` : ""}
            </p>
            {refreshing && (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Updating
              </p>
            )}
          </div>
        </div>
      </Panel>
      {refreshError && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
        >
          <span>
            Couldn’t refresh campaign data. Showing the last available results. {refreshError}
          </span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="No campaigns found"
            description="Try a different search or filter, or create a new campaign."
            action={
              <Button asChild>
                <Link to="/organisation/campaigns/new">Create campaign</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.rows.map((campaign, index) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                raised={campaignRaised(campaign.id)}
                members={count(campaign.id)}
                index={index}
              />
            ))}
          </div>
          <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} />
        </>
      )}
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  tone: "green" | "blue" | "gold";
}) {
  const styles = {
    green: "bg-primary-soft text-primary",
    blue: "bg-info-soft text-info",
    gold: "bg-warning-soft text-warning",
  };
  return (
    <Panel className="relative isolate overflow-hidden p-3 sm:p-5">
      <div className="absolute -right-7 -top-8 -z-10 size-24 rounded-full bg-primary-soft/60 blur-2xl" />
      <div className="flex items-center gap-3 sm:hidden">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${styles[tone]}`}>
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{label}</p>
            <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{note}</p>
          </div>
          <p className="shrink-0 whitespace-nowrap text-base font-bold tracking-tight tabular-nums">
            {value}
          </p>
        </div>
      </div>
      <div className="hidden items-start justify-between gap-3 sm:flex">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${styles[tone]}`}>
          {icon}
        </span>
      </div>
    </Panel>
  );
}

function CampaignCard({
  campaign,
  raised,
  members,
  index,
}: {
  campaign: Campaign;
  raised: number;
  members: number;
  index: number;
}) {
  const cover = campaign.coverImageUrl || campaign.imageUrls?.[0];
  const progress = pct(raised, campaign.target);
  const accents = [
    "from-emerald-950 via-emerald-800 to-teal-600",
    "from-indigo-950 via-indigo-800 to-sky-600",
    "from-amber-950 via-orange-800 to-rose-500",
  ];
  return (
    <Link
      to="/organisation/campaigns/$campaignId"
      params={{ campaignId: campaign.id }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/75 bg-card shadow-card transition duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={`relative h-40 overflow-hidden bg-gradient-to-br ${accents[index % accents.length]}`}
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <>
            <div className="absolute -right-8 -top-12 size-48 rounded-full border border-white/15" />
            <div className="absolute -right-1 -top-5 size-32 rounded-full border border-white/20" />
            <div className="absolute -bottom-16 -left-8 size-44 rounded-full bg-white/10 blur-xl" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="grid size-16 place-items-center rounded-2xl border border-white/25 bg-white/15 text-white shadow-lg backdrop-blur-sm">
                <Sparkles className="size-8" />
              </div>
            </div>
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/10" />
        <div className="absolute left-4 top-4">
          <StatusBadge status={campaign.status} />
        </div>
        <p className="absolute bottom-4 left-4 right-4 line-clamp-2 font-display text-xl font-semibold leading-tight text-white drop-shadow-sm">
          {campaign.name}
        </p>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <p className="line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">
          {campaign.shortDescription ||
            campaign.description ||
            "A community fundraising campaign making a difference."}
        </p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Verified funds raised</p>
            <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
              {formatKES(raised)}
            </p>
          </div>
          <p className="pb-0.5 text-right text-xs text-muted-foreground">
            Target{" "}
            <span className="block font-semibold text-foreground">
              {formatKES(campaign.target)}
            </span>
          </p>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-semibold text-primary">{progress}% funded</span>
          <span className="tabular-nums text-muted-foreground">
            {formatKES(Math.max(0, campaign.target - raised))} to go
          </span>
        </div>
        <ProgressBar
          size="md"
          value={progress}
          className="mt-2.5 h-2 rounded-full bg-muted [&>div]:rounded-full"
        />
        <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" />
            {members} {members === 1 ? "member" : "members"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            Ends {formatDate(campaign.endDate)}
          </span>
        </div>
        <span className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-primary transition-all group-hover:gap-2">
          View campaign <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
