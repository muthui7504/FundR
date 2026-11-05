import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterChips, PageHeader, Panel, StatCard, StatusBadge } from "@/components/kit";
import { useDemo } from "@/context/DemoStore";
import { formatDate, formatKES, maskPhone, outstandingPledges } from "@/utils/format";
import { meta } from "@/utils/meta";
import { api } from "@/services/api";
import type { Pledge } from "@/types";

export const Route = createFileRoute("/member/pledges")({
  head: () => meta("My pledges", "Pledges supporters have made to your fundraising pages."),
  component: Pledges,
});

const ST = ["ALL", "PENDING", "DUE_SOON", "OVERDUE", "FULFILLED", "CANCELLED", "EXPIRED"] as const;

function Pledges() {
  const { pledges, profiles, setPledges, memberId } = useDemo();
  const ids = profiles.filter((p) => p.memberId === memberId).map((p) => p.id);
  const mine = pledges.filter((p) => ids.includes(p.profileId));
  const [st, setSt] = useState<(typeof ST)[number]>("ALL");
  const rows = mine.filter((p) => st === "ALL" || p.status === st);
  return (
    <>
      <PageHeader title="My pledges" description="Promises from supporters. Pledges are never counted as money raised." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={formatKES(outstandingPledges(mine))} tone="warning" />
        <StatCard label="Overdue" value={String(mine.filter((p) => p.status === "OVERDUE").length)} tone="muted" />
        <StatCard label="Fulfilled" value={String(mine.filter((p) => p.status === "FULFILLED").length)} />
      </div>
      <div className="mb-4"><FilterChips options={ST} value={st} onChange={setSt} /></div>
      <Panel>
        {rows.length === 0 ? <EmptyState title="No pledges here" /> : (
          <ul className="divide-y">{rows.map((p) => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{p.supporterName} <span className="text-xs text-muted-foreground">· +{maskPhone(p.phone)}</span></p>
                <p className="truncate text-xs text-muted-foreground">{profiles.find((x) => x.id === p.profileId)?.title} · due {formatDate(p.dueDate)}</p></div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-semibold">{formatKES(p.amount)}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <select
                    aria-label={`Change status for ${p.supporterName}'s pledge`}
                    value={p.status}
                    onChange={async (event) => {
                      const status = event.target.value as Pledge["status"];
                      try {
                        const updated = await api.pledges.update(p.id, { status });
                        setPledges((items) =>
                          items.map((item) => (item.id === updated.id ? updated : item)),
                        );
                        toast.success("Pledge status updated.");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Unable to update pledge.");
                      }
                    }}
                    className="h-8 rounded-lg border bg-card px-2 text-xs"
                  >
                    {ST.filter((value) => value !== "ALL").map((value) => (
                      <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    aria-label={`Delete pledge from ${p.supporterName}`}
                    onClick={async () => {
                      if (!window.confirm("Delete this pledge? This cannot be undone.")) return;
                      try {
                        await api.pledges.delete(p.id);
                        setPledges((items) => items.filter((item) => item.id !== p.id));
                        toast.success("Pledge deleted.");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Unable to delete pledge.");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>))}</ul>
        )}
      </Panel>
    </>
  );
}
