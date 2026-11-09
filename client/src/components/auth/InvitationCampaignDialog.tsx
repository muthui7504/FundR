import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDemo } from "@/context/DemoStore";
import { api, type InvitationCampaign } from "@/services/api";
import { formatDate } from "@/utils/format";

export function InvitationCampaignDialog({
  campaigns,
  open,
  onSkip,
}: {
  campaigns: InvitationCampaign[];
  open: boolean;
  onSkip: () => void;
}) {
  const navigate = useNavigate();
  const { setParticipants } = useDemo();
  const [joiningId, setJoiningId] = useState("");
  const [error, setError] = useState("");

  const joinCampaign = async (campaign: InvitationCampaign) => {
    setJoiningId(campaign.id);
    setError("");
    try {
      await api.campaigns.join(campaign.joinCode);
      setParticipants(await api.campaigns.mine());
      await navigate({
        to: "/member/fundraising-pages/create",
        search: { campaign: campaign.id },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to join this campaign.");
    } finally {
      setJoiningId("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !joiningId) onSkip();
      }}
    >
      <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-3xl border-0 p-0 shadow-2xl">
        <div className="bg-gradient-to-br from-primary/10 via-background to-info-soft/60 p-5 pb-4 sm:p-7">
          <DialogHeader className="pr-7 text-left">
            <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Sparkles className="size-5" />
            </span>
            <DialogTitle className="text-xl font-bold sm:text-2xl">
              Choose a campaign to join
            </DialogTitle>
            <DialogDescription className="max-w-lg text-sm leading-relaxed">
              You’re invited to your organisation. Pick an active campaign to start fundraising, or
              skip this step and explore your dashboard first.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-7 sm:py-5">
          {campaigns.map((campaign) => {
            const joining = joiningId === campaign.id;
            return (
              <button
                key={campaign.id}
                type="button"
                onClick={() => void joinCampaign(campaign)}
                disabled={!campaign.canJoin || Boolean(joiningId)}
                className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:gap-4 sm:p-4"
              >
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/15 to-info-soft text-primary sm:size-16">
                  {campaign.coverImageUrl ? (
                    <img src={campaign.coverImageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Sparkles className="size-6" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{campaign.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                        campaign.canJoin
                          ? "bg-primary-soft text-primary"
                          : "bg-warning-soft text-warning"
                      }`}
                    >
                      {campaign.canJoin ? "Open to join" : "At capacity"}
                    </span>
                  </span>
                  {campaign.shortDescription && (
                    <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {campaign.shortDescription}
                    </span>
                  )}
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      Ends {formatDate(campaign.endDate)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <UsersRound className="size-3" />
                      {campaign.activeMemberCount} participant
                      {campaign.activeMemberCount === 1 ? "" : "s"}
                      {campaign.maxMembers !== null ? ` · ${campaign.maxMembers} max` : ""}
                    </span>
                  </span>
                </span>
                <span className="hidden shrink-0 text-primary sm:block">
                  {joining ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : campaign.canJoin ? (
                    <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                  ) : (
                    <CheckCircle2 className="size-5 text-muted-foreground" />
                  )}
                </span>
              </button>
            );
          })}
          {error && (
            <p
              className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              disabled={Boolean(joiningId)}
              onClick={onSkip}
            >
              Skip for now
            </Button>
            <p className="flex items-center justify-center gap-1.5 px-2 text-center text-xs text-muted-foreground sm:justify-end">
              <CheckCircle2 className="size-3.5 text-primary" />
              You can join campaigns later from your dashboard.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
