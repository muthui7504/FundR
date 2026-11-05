import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, FilterChips, PageHeader, Pagination, Panel, StatusBadge, usePaged } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/context/DemoStore";
import { actualRaised, formatDate, formatKES, supporterLabel } from "@/utils/format";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/member/contributions")({
  head: () => meta("Contribution history", "Every M-Pesa contribution to your fundraising pages and its status."),
  component: History,
});

const ST = ["ALL", "COMPLETED", "PENDING", "FAILED", "REVERSED", "REFUNDED"] as const;

function History() {
  const { profiles, contributions, memberId } = useDemo();
  const ids = profiles.filter((p) => p.memberId === memberId).map((p) => p.id);
  const publishedPage = profiles.find((p) => p.memberId === memberId && p.status === "PUBLISHED");
  const mine = contributions.filter((c) => ids.includes(c.profileId));
  const [st, setSt] = useState<(typeof ST)[number]>("ALL");
  const pg = usePaged(mine.filter((c) => st === "ALL" || c.status === st), 10);
  return (
    <div className="pb-24">
      <PageHeader title="Contribution history" description={`Verified total: ${formatKES(actualRaised(mine))}. Only completed contributions count.`} />
      <div className="mb-4"><FilterChips options={ST} value={st} onChange={setSt} /></div>
      <Panel>
        {pg.rows.length === 0 ? <EmptyState title="No contributions" /> : (<>
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Supporter</th><th className="p-4">Page</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">M-Pesa ref</th><th className="p-4">Date</th></tr></thead>
            <tbody>{pg.rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0"><td className="p-4 font-medium">{supporterLabel(c.supporterName)}</td><td className="p-4 text-muted-foreground">{profiles.find((p) => p.id === c.profileId)?.title}</td><td className="p-4 font-semibold">{formatKES(c.amount)}</td><td className="p-4"><StatusBadge status={c.status} /></td><td className="p-4 font-mono text-xs">{c.receipt ?? "—"}</td><td className="p-4 text-muted-foreground">{formatDate(c.createdAt)}</td></tr>))}</tbody>
          </table>
          <ul className="divide-y md:hidden">{pg.rows.map((c) => (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-4 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{supporterLabel(c.supporterName)}</p><p className="truncate text-xs text-muted-foreground">{formatDate(c.createdAt)} · {c.receipt ?? "no ref"}</p></div>
              <div className="flex flex-col items-end gap-1"><span className="font-semibold">{formatKES(c.amount)}</span><StatusBadge status={c.status} /></div>
            </li>))}</ul>
          <Pagination page={pg.page} pages={pg.pages} onPage={pg.setPage} />
        </>)}
      </Panel>
      {publishedPage && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Ready to contribute?</p>
              <p className="truncate text-xs text-muted-foreground">Open your published fundraising page to choose an amount and enter a phone number.</p>
            </div>
            <Button asChild className="shrink-0">
              <Link to="/fundraiser/$slug" params={{ slug: publishedPage.slug }}>Contribute</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
