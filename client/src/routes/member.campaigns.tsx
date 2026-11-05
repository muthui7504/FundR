import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, ProgressBar, StatusBadge } from "@/components/kit";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { effectiveParticipantStatus, formatDate, formatKES, pct } from "@/utils/format";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/member/campaigns")({
  head: () => meta("My campaigns", "Campaigns you have joined and your participation status."),
  component: MyCampaigns,
});

function MyCampaigns() {
  const { participants, campaigns, profiles, memberId } = useDemo();
  const mine = participants.filter((participant) => participant.memberId === memberId);
  return (
    <>
      <PageHeader title="My campaigns" description="Campaigns you're part of." actions={<Button asChild><Link to="/member/join-campaign">Join a campaign</Link></Button>} />
      {mine.length === 0 ? <Panel><EmptyState title="You haven't joined any campaigns" action={<Button asChild><Link to="/member/join-campaign">Join with a code</Link></Button>} /></Panel> : (
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((p) => {
            const c = campaigns.find((x) => x.id === p.campaignId);
            if (!c) return null;
            const r = campaignRaised(c.id);
            const page = profiles.find((x) => x.campaignId === c.id);
            return (
              <Panel key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{c.name}</h3></div><StatusBadge status={effectiveParticipantStatus(c.status, p.status)} /></div>
                <p className="mt-3 text-sm">{formatKES(r)} <span className="text-muted-foreground">of {formatKES(c.target)}</span></p>
                <ProgressBar value={pct(r, c.target)} className="mt-2" />
                <p className="mt-2 text-xs text-muted-foreground">Joined {formatDate(p.joinedAt)} · ends {formatDate(c.endDate)}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {page && c.status === "ACTIVE" ? <Button asChild variant="outline" size="sm"><Link to="/fundraiser/$slug" params={{ slug: page.slug }}>View my page</Link></Button>
                    : p.status === "ACTIVE" && c.status === "ACTIVE" ? <Button asChild size="sm"><Link to="/member/fundraising-pages/create" search={{ campaign: c.id }}>Create fundraising page</Link></Button> : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
