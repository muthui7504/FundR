import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, ExternalLink, MessageCircle, Pencil, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, Panel, ProgressBar, StatusBadge } from "@/components/kit";
import { profileRaised, useDemo } from "@/context/DemoStore";
import { formatKES, pct } from "@/utils/format";
import { meta } from "@/utils/meta";
import type { FundraisingProfile } from "@/types";

export const Route = createFileRoute("/member/fundraising-pages/")({
  head: () => meta("My fundraising pages", "View, edit and share your personal fundraising pages."),
  component: Pages,
});

function Pages() {
  const { profiles, campaigns, contributions, organisations, memberId } = useDemo();
  const mine = profiles.filter(
    (p) =>
      p.memberId === memberId &&
      campaigns.some((campaign) => campaign.id === p.campaignId && campaign.status === "ACTIVE"),
  );
  const [share, setShare] = useState<FundraisingProfile | null>(null);
  const url = (p: FundraisingProfile) => `https://fundraise.co.ke/fundraiser/${p.slug}`;
  return (
    <>
      <PageHeader title="My fundraising pages" description="One page per campaign you've joined." actions={<Button asChild><Link to="/member/fundraising-pages/create"><Plus className="h-4 w-4" />Create page</Link></Button>} />
      {mine.length === 0 ? <Panel><EmptyState title="No fundraising pages yet" description="Join a campaign and create your first page." action={<Button asChild><Link to="/member/fundraising-pages/create">Create page</Link></Button>} /></Panel> : (
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((p) => {
            const c = campaigns.find((x) => x.id === p.campaignId)!; const r = profileRaised(p.id);
            const n = contributions.filter((x) => x.profileId === p.id && x.status === "COMPLETED").length;
            return (
              <Panel key={p.id} className="p-5">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{c.name} · {organisations.find((organisation) => organisation.id === c.orgId)?.name}</p><h3 className="font-semibold">{p.title}</h3></div><StatusBadge status={p.status} /></div>
                <p className="mt-4 text-xl font-bold">{formatKES(r)} {p.target && <span className="text-sm font-normal text-muted-foreground">of {formatKES(p.target)}</span>}</p>
                {p.target && <ProgressBar value={pct(r, p.target)} className="mt-2" />}
                <p className="mt-2 text-xs text-muted-foreground">{n} completed contributions</p>
                <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{url(p)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline"><Link to="/fundraiser/$slug" params={{ slug: p.slug }}><ExternalLink className="h-4 w-4" />View</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/member/fundraising-pages/$profileId/edit" params={{ profileId: p.id }}><Pencil className="h-4 w-4" />Edit</Link></Button>
                  <Button size="sm" onClick={() => setShare(p)}><Share2 className="h-4 w-4" />Share</Button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <Dialog open={!!share} onOpenChange={(o) => !o && setShare(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share your page</DialogTitle></DialogHeader>
          {share && (<div className="space-y-3">
            <div className="break-all rounded-xl bg-muted p-3 font-mono text-xs">{url(share)}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(url(share)); toast.success("Link copied"); }}><Copy className="h-4 w-4" />Copy link</Button>
              <Button asChild><a href={`https://wa.me/?text=${encodeURIComponent(`Please support my fundraiser: ${share.title} ${url(share)}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a></Button>
            </div>
          </div>)}
        </DialogContent>
      </Dialog>
    </>
  );
}
