import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterChips, PageHeader, Pagination, Panel, ProgressBar, SearchInput, StatusBadge, inputCls, usePaged } from "@/components/kit";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { api } from "@/services/api";
import { formatDate, formatKES, pct } from "@/utils/format";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/organisation/campaigns/")({
  head: () => meta("Campaigns", "Create, search and manage your organisation's fundraising campaigns."),
  component: Campaigns,
});

const STATUSES = ["ALL", "DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;

function Campaigns() {
  const { campaigns, participants, org, setCampaigns, setParticipants, setContributions } = useDemo();
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
  const [q, setQ] = useState(""); const [st, setSt] = useState<(typeof STATUSES)[number]>("ALL"); const [sort, setSort] = useState("newest");
  const rows = useMemo(() => {
    const r = campaigns.filter((c) => c.orgId === org.id && (st === "ALL" || c.status === st) && c.name.toLowerCase().includes(q.toLowerCase()));
    return [...r].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "raised" ? campaignRaised(b.id) - campaignRaised(a.id) : b.startDate.localeCompare(a.startDate));
  }, [campaigns, org.id, q, st, sort]);
  const pg = usePaged(rows, 6);
  const count = (id: string) => participants.filter((p) => p.campaignId === id && p.status === "ACTIVE").length;
  return (
    <>
      <PageHeader title="Campaigns" description={`All fundraising campaigns for ${org.name || "your organisation"}.`} actions={<Button asChild><Link to="/organisation/campaigns/new"><Plus className="h-4 w-4" />Create campaign</Link></Button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search campaigns" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterChips options={STATUSES} value={st} onChange={setSt} />
          <select aria-label="Sort" className={inputCls + " h-9 sm:w-40"} value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="name">Name</option><option value="raised">Most raised</option></select>
        </div>
      </div>
      {refreshing && <p role="status" className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing campaign data…</p>}
      {refreshError && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"><span>Couldn’t refresh campaign data. Showing the last available results. {refreshError}</span><Button variant="outline" size="sm" onClick={() => void refresh()}>Retry</Button></div>}
      <Panel>
        {rows.length === 0 ? <EmptyState title="No campaigns found" description="Try a different search or filter, or create a new campaign." action={<Button asChild><Link to="/organisation/campaigns/new">Create campaign</Link></Button>} /> : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Campaign</th><th className="p-4">Status</th><th className="p-4">Raised</th><th className="p-4">Members</th><th className="p-4">Ends</th></tr></thead>
              <tbody>
                {pg.rows.map((c) => { const r = campaignRaised(c.id); return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-4"><Link to="/organisation/campaigns/$campaignId" params={{ campaignId: c.id }} className="font-semibold hover:text-primary">{c.name}</Link><p className="text-xs text-muted-foreground">{c.shortDescription}</p></td>
                    <td className="p-4"><StatusBadge status={c.status} /></td>
                    <td className="w-56 p-4"><p className="font-medium">{formatKES(r)} <span className="text-xs text-muted-foreground">/ {formatKES(c.target)}</span></p><ProgressBar size="sm" value={pct(r, c.target)} className="mt-1.5" /></td>
                    <td className="p-4">{count(c.id)}</td>
                    <td className="p-4 text-muted-foreground">{formatDate(c.endDate)}</td>
                  </tr>); })}
              </tbody>
            </table>
            <div className="divide-y md:hidden">
              {pg.rows.map((c) => { const r = campaignRaised(c.id); return (
                <Link key={c.id} to="/organisation/campaigns/$campaignId" params={{ campaignId: c.id }} className="block p-4">
                  <div className="flex items-start justify-between gap-2"><p className="font-semibold">{c.name}</p><StatusBadge status={c.status} /></div>
                  <p className="mt-2 text-sm">{formatKES(r)} <span className="text-muted-foreground">of {formatKES(c.target)}</span></p>
                  <ProgressBar size="sm" value={pct(r, c.target)} className="mt-2" />
                  <p className="mt-2 text-xs text-muted-foreground">{count(c.id)} members · ends {formatDate(c.endDate)}</p>
                </Link>); })}
            </div>
            <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
