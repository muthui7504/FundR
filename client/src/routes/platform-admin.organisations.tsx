import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, FilterChips, PageHeader, Panel, SearchInput, StatusBadge, EmptyState } from "@/components/kit";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { formatDate, formatKES } from "@/utils/format";
import { meta } from "@/utils/meta";
import { showSuccess } from "@/utils/notifications";

export const Route = createFileRoute("/platform-admin/organisations")({
  head: () => meta("Organisations", "Review, activate and suspend organisations on FundR."),
  component: Orgs,
});

const FILTERS = ["ALL", "ACTIVE", "SUSPENDED"] as const;

function Orgs() {
  const { organisations, setOrganisations, campaigns } = useDemo();
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]>("ALL");
  const [organisationToChange, setOrganisationToChange] = useState<typeof organisations[number] | null>(null);
  const list = organisations.filter((o) => (f === "ALL" || o.status === f) && `${o.name} ${o.city} ${o.type}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => {
    setOrganisations((all) => all.map((o) => (o.id === id ? { ...o, status: o.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" } : o)));
    const o = organisations.find((x) => x.id === id)!;
    showSuccess(
      o.status === "ACTIVE" ? "Organisation suspended" : "Organisation reactivated",
      `${o.name} is now ${o.status === "ACTIVE" ? "suspended" : "active"}.`,
    );
  };
  return (
    <>
      <PageHeader title="Organisations" description="All organisations registered on FundR." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, city or type" />
        <FilterChips options={FILTERS} value={f} onChange={setF} />
      </div>
      {list.length === 0 ? <EmptyState title="No organisations found" description="Try a different search or filter." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((o) => {
            const mine = campaigns.filter((c) => c.orgId === o.id);
            const raised = mine.reduce((a, c) => a + campaignRaised(c.id), 0);
            return (
              <Panel key={o.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div><Link to="/platform-admin/organisation/$organisationId" params={{ organisationId: o.id }} className="font-semibold hover:text-primary">{o.name}</Link><p className="text-xs text-muted-foreground">{o.type} · {o.city} · joined {formatDate(o.createdAt)}</p></div>
                  <StatusBadge status={o.status} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Campaigns</dt><dd className="font-semibold">{mine.length}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Raised</dt><dd className="font-semibold">{formatKES(raised)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Contact</dt><dd className="truncate">{o.phone}</dd></div>
                </dl>
                <div className="mt-4 flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline"><Link to="/platform-admin/organisation/$organisationId" params={{ organisationId: o.id }}>View details</Link></Button>
                  <Button size="sm" variant={o.status === "ACTIVE" ? "outline" : "default"} onClick={() => setOrganisationToChange(o)}>
                    {o.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(organisationToChange)}
        onOpenChange={(open) => !open && setOrganisationToChange(null)}
        destructive={organisationToChange?.status === "ACTIVE"}
        title={`${organisationToChange?.status === "ACTIVE" ? "Suspend" : "Reactivate"} ${organisationToChange?.name ?? "organisation"}?`}
        description={organisationToChange?.status === "ACTIVE"
          ? "This organisation will no longer be active on the platform."
          : "This organisation will be active on the platform again."}
        confirmLabel={organisationToChange?.status === "ACTIVE" ? "Suspend organisation" : "Reactivate organisation"}
        onConfirm={() => {
          if (!organisationToChange) return;
          toggle(organisationToChange.id);
          setOrganisationToChange(null);
        }}
      />
    </>
  );
}
