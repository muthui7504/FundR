import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, PageHeader, Panel, ProgressBar, StatusBadge } from "@/components/kit";
import { campaignRaised, useDemo } from "@/context/DemoStore";
import { effectiveParticipantStatus, formatDate, formatKES, pct } from "@/utils/format";
import { meta } from "@/utils/meta";
import type { Campaign } from "@/types";

export const Route = createFileRoute("/member/campaigns")({
  head: () => meta("My campaigns", "Campaigns you have joined and your participation status."),
  component: MyCampaigns,
});

function MyCampaigns() {
  const { participants, campaigns, profiles, memberId } = useDemo();
  const [projectDetails, setProjectDetails] = useState<Campaign | null>(null);
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
              <Panel key={c.id} className="overflow-hidden p-5">
                {c.imageUrls?.[0] && (
                  <img
                    src={c.imageUrls[0]}
                    alt={`${c.name} project`}
                    className="-mx-5 -mt-5 mb-4 h-40 w-[calc(100%+2.5rem)] object-cover"
                  />
                )}
                <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{c.name}</h3></div><StatusBadge status={effectiveParticipantStatus(c.status, p.status)} /></div>
                <p className="mt-3 text-sm">{formatKES(r)} <span className="text-muted-foreground">of {formatKES(c.target)}</span></p>
                <ProgressBar value={pct(r, c.target)} className="mt-2" />
                <p className="mt-2 text-xs text-muted-foreground">Joined {formatDate(p.joinedAt)} · ends {formatDate(c.endDate)}</p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-2 h-auto justify-start px-0"
                  onClick={() => setProjectDetails(c)}
                >
                  More about this project
                  {!!c.imageUrls?.length && (
                    <span className="text-muted-foreground">· {c.imageUrls.length} photos</span>
                  )}
                </Button>
                <div className="mt-4 flex flex-wrap gap-2">
                  {page && c.status === "ACTIVE" ? <Button asChild variant="outline" size="sm"><Link to="/fundraiser/$slug" params={{ slug: page.slug }}>View my page</Link></Button>
                    : p.status === "ACTIVE" && c.status === "ACTIVE" ? <Button asChild size="sm"><Link to="/member/fundraising-pages/create" search={{ campaign: c.id }}>Create fundraising page</Link></Button> : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <Dialog
        open={!!projectDetails}
        onOpenChange={(open) => {
          if (!open) setProjectDetails(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{projectDetails?.name ?? "About this project"}</DialogTitle>
            <DialogDescription>
              {projectDetails?.shortDescription || "Project details and progress photos"}
            </DialogDescription>
          </DialogHeader>
          {projectDetails && (
            <div className="space-y-5">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {projectDetails.description ||
                  projectDetails.shortDescription ||
                  "More project information will be shared by your organisation."}
              </p>
              {projectDetails.imageUrls?.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {projectDetails.imageUrls.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={`${projectDetails.name} progress photo ${index + 1}`}
                      className="aspect-[4/3] w-full rounded-xl border object-cover"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center rounded-2xl border border-dashed bg-muted/30 px-5 py-8 text-center">
                  <ImageIcon className="size-8 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium">Progress photos coming soon</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your organisation has not added project photos yet.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
