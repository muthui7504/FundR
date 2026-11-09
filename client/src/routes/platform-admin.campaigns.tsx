import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FilterChips, PageHeader, Panel, ProgressBar, SearchInput, StatusBadge, EmptyState } from "@/components/kit";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { formatDate, formatKES, pct } from "@/utils/format";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/platform-admin/campaigns")({
  head: () => meta("All campaigns", "Every campaign running on FundR, with verified totals."),
  component: Campaigns,
});

const FILTERS = ["ALL", "ACTIVE", "DRAFT", "PAUSED", "COMPLETED"] as const;

function Campaigns() {
  const { campaigns, organisations, participants } = useDemo();
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]>("ALL");
  const list = campaigns.filter((c) => (f === "ALL" || c.status === f) && `${c.name} ${organisations.find((organisation) => organisation.id === c.orgId)?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="All campaigns" description="Campaigns across every organisation." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search campaign or organisation" />
        <FilterChips options={FILTERS} value={f} onChange={setF} />
      </div>
      {list.length === 0 ? <EmptyState title="No campaigns found" /> : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr><th className="p-3">Campaign</th><th className="p-3">Organisation</th><th className="p-3">Participants</th><th className="p-3">Progress</th><th className="p-3">Ends</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {list.map((c) => {
                const r = campaignRaised(c.id);
                return (
                  <tr key={c.id}>
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-muted-foreground">{organisations.find((organisation) => organisation.id === c.orgId)?.name}</td>
                    <td className="p-3">{participants.filter((participant) => participant.campaignId === c.id && participant.status === "ACTIVE").length}</td>
                    <td className="p-3 w-56"><p className="text-xs">{formatKES(r)} of {formatKES(c.target)}</p><ProgressBar value={pct(r, c.target)} size="sm" className="mt-1" /></td>
                    <td className="p-3">{formatDate(c.endDate)}</td>
                    <td className="p-3"><StatusBadge status={c.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
