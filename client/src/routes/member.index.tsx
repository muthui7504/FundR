import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Copy, ExternalLink, FileHeart, Megaphone, MessageCircle, Pencil, Plus, Share2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Panel, StatCard, StatusBadge } from "@/components/kit";
import { CountBarChart } from "@/components/charts";
import { profileRaised, useDemo } from "@/context/DemoStore";
import { formatDate, formatKES, outstandingPledges, pct, supporterLabel } from "@/utils/format";
import { meta } from "@/utils/meta";
import type { FundraisingProfile } from "@/types";

export const Route = createFileRoute("/member/")({
  head: () => meta("My fundraising", "Your verified totals, pages, campaigns and pledges."),
  component: Overview,
});

function Overview() {
  const { profiles, campaigns, participants, pledges, contributions, memberId, user } = useDemo();
  const [sharePage, setSharePage] = useState<FundraisingProfile | null>(null);
  const mine = profiles.filter((p) => p.memberId === memberId);
  const ids = mine.map((p) => p.id);
  const raised = mine.reduce((a, p) => a + profileRaised(p.id), 0);
  const joined = participants.filter((p) => p.memberId === memberId && p.status === "ACTIVE").length;
  const myContribs = contributions.filter((c) => ids.includes(c.profileId));
  const recentCompletedContribs = myContribs.filter((c) => c.status === "COMPLETED").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const months = ["Jun", "Jul", "Aug", "Sep", "Oct"];
  const series = months.map((m, i) => ({ month: m, count: recentCompletedContribs.filter((c) => new Date(c.createdAt).getMonth() === 5 + i).length }));
  const pageUrl = (page: FundraisingProfile) =>
    `${window.location.origin}/fundraiser/${page.slug}`;
  const copyPageLink = async (page: FundraisingProfile) => {
    try {
      await navigator.clipboard.writeText(pageUrl(page));
      toast.success("Fundraising page link copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to copy the page link.");
    }
  };
  return (
    <>
      <PageHeader title={`Habari, ${user?.firstName || "Member"}`} description="Here's how your fundraising is going."
        actions={<><Button asChild variant="outline"><Link to="/member/join-campaign">Join a campaign</Link></Button><Button asChild><Link to="/member/fundraising-pages/create"><Plus className="h-4 w-4" />New page</Link></Button></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total actual raised" value={formatKES(raised)} hint="Verified contributions" icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Active pages" value={String(mine.filter((p) => p.status === "PUBLISHED" && campaigns.some((campaign) => campaign.id === p.campaignId && campaign.status === "ACTIVE")).length)} icon={<FileHeart className="h-5 w-5" />} tone="info" />
        <StatCard label="Campaigns joined" value={String(joined)} icon={<Megaphone className="h-5 w-5" />} tone="muted" />
        <StatCard label="Outstanding pledges" value={formatKES(outstandingPledges(pledges.filter((p) => ids.includes(p.profileId))))} hint="Not included in raised" icon={<CalendarClock className="h-5 w-5" />} tone="warning" />
      </div>
      <Panel className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-4 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><FileHeart className="size-5" /></span>
              <h2 className="font-semibold">Your fundraising pages</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Your pages, progress and sharing links in one place.</p>
          </div>
          <Button asChild size="sm" variant="outline"><Link to="/member/fundraising-pages">View all pages<ExternalLink className="size-4" /></Link></Button>
        </div>
        {mine.length === 0 ? (
          <div className="p-6 sm:p-8">
            <div className="mx-auto max-w-md rounded-2xl border border-dashed bg-muted/30 px-5 py-8 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-background text-primary shadow-sm"><FileHeart className="size-6" /></span>
              <h3 className="mt-4 font-semibold">Your first page starts here</h3>
              <p className="mt-1 text-sm text-muted-foreground">Create a personal page for one of your campaigns and invite others to support it.</p>
              <Button asChild size="sm" className="mt-4"><Link to="/member/fundraising-pages/create"><Plus className="size-4" />Create a page</Link></Button>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {mine.slice(0, 4).map((page) => {
              const campaign = campaigns.find((item) => item.id === page.campaignId);
              const pageRaised = profileRaised(page.id);
              const progress = page.target ? pct(pageRaised, page.target) : null;
              return (
                <li key={page.id} className="flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileHeart className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 font-semibold leading-snug">{page.title}</h3>
                        <StatusBadge status={page.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{campaign?.name ?? "Campaign"}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Raised so far</p>
                      <p className="mt-1 text-xl font-bold">{formatKES(pageRaised)}</p>
                    </div>
                    {page.target && <p className="shrink-0 pb-1 text-sm text-muted-foreground">of {formatKES(page.target)}</p>}
                  </div>
                  {progress !== null && (
                    <div className="mt-3">
                      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Progress</span><span>{progress}%</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
                    {page.status === "PUBLISHED" && <Button asChild size="sm" variant="outline"><Link to="/fundraiser/$slug" params={{ slug: page.slug }}><ExternalLink className="size-4" />View</Link></Button>}
                    <Button asChild size="sm" variant="outline"><Link to="/member/fundraising-pages/$profileId/edit" params={{ profileId: page.id }}><Pencil className="size-4" />Edit</Link></Button>
                    <Button size="sm" className="ml-auto" onClick={() => setSharePage(page)} disabled={page.status !== "PUBLISHED"}><Share2 className="size-4" />Share</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Dialog open={!!sharePage} onOpenChange={(open) => !open && setSharePage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share your fundraising page</DialogTitle>
            <DialogDescription>{sharePage?.title}</DialogDescription>
          </DialogHeader>
          {sharePage && (
            <div className="space-y-4">
              <div className="break-all rounded-xl border bg-muted/50 p-3 font-mono text-sm">{pageUrl(sharePage)}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => void copyPageLink(sharePage)}><Copy className="size-4" />Copy link</Button>
                <Button asChild><a href={`https://wa.me/?text=${encodeURIComponent(`Please support my fundraiser: ${sharePage.title} ${pageUrl(sharePage)}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />Share on WhatsApp</a></Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2"><h2 className="font-semibold">Completed contributions per month</h2><div className="mt-4"><CountBarChart data={series} dataKey="count" label="Contributions" /></div></Panel>
        <Panel className="p-5">
          <h2 className="font-semibold">Recent contributions</h2>
          <ul className="mt-4 space-y-3">{recentCompletedContribs.slice(0, 6).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{supporterLabel(c.supporterName)}</p><p className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</p></div>
              <div className="flex shrink-0 items-center gap-2"><span className="font-semibold">{formatKES(c.amount)}</span><StatusBadge status={c.status} /></div>
            </li>))}</ul>
        </Panel>
      </div>
      <Panel className="mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-semibold">Share your page to raise more</p><p className="text-sm text-muted-foreground">Pages shared on WhatsApp raise 3× more on average.</p></div>
        <Button asChild variant="outline"><Link to="/member/fundraising-pages"><Share2 className="h-4 w-4" />Share my pages</Link></Button>
      </Panel>
    </>
  );
}
