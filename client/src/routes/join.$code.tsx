import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Panel, StatusBadge } from "@/components/kit";
import { PublicFooter, PublicHeader } from "@/components/layout/PublicChrome";
import { useDemo } from "@/context/DemoStore";
import { ApiError, api, type AuthUser } from "@/services/api";
import { meta } from "@/utils/meta";
import type { Campaign } from "@/types";

export const Route = createFileRoute("/join/$code")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  head: () => meta("Join a campaign", "View a campaign and join your organisation's team."),
  component: JoinCampaign,
});

function JoinCampaign() {
  const { code } = Route.useParams();
  const { invite } = Route.useSearch();
  const { setParticipants } = useDemo();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [canRegister, setCanRegister] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setInviteError("");
    setCampaign(null);
    setUser(null);
    setCanRegister(false);
    setJoined(false);
    setAlreadyJoined(false);

    void (async () => {
      try {
        const foundCampaign = await api.campaigns.findByCode(code);
        if (!active) return;
        if (foundCampaign.status !== "ACTIVE") {
          setError("This campaign is no longer accepting members.");
          return;
        }
        setCampaign(foundCampaign);

        const session = await api.auth.me().catch((cause: unknown) => {
          if (cause instanceof ApiError && cause.status === 401) return null;
          throw cause;
        });
        if (!active) return;
        setUser(session?.data.user ?? null);

        if (invite) {
          try {
            const invitation = await api.invitations.validate(invite, foundCampaign.joinCode);
            if (!active) return;
            if (invitation.organisationId !== foundCampaign.orgId) {
              setInviteError("This account invitation belongs to a different organisation.");
            } else if (!invitation.canJoin) {
              setInviteError("This campaign has reached its member limit. Contact the organisation administrator about upgrading this campaign.");
            } else {
              setCanRegister(true);
            }
          } catch (cause) {
            if (!active) return;
            setInviteError(cause instanceof Error ? cause.message : "The account invitation could not be verified.");
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load this campaign.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [code, invite]);

  const join = async () => {
    if (!campaign || joining) return;
    setJoining(true);
    setError("");
    try {
      const result = await api.campaigns.join(campaign.joinCode);
      if (result.alreadyJoined) {
        setAlreadyJoined(true);
      } else {
        setJoined(true);
        toast.success("You joined the campaign");
      }
      try {
        setParticipants(await api.campaigns.mine());
      } catch {
        // The successful join response is authoritative; dashboard data can refresh on navigation.
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to join this campaign.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        {loading ? (
          <Panel className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p role="status" className="text-sm text-muted-foreground">Loading campaign…</p>
          </Panel>
        ) : error && !campaign ? (
          <Panel className="p-6"><ErrorState message={error} /></Panel>
        ) : !campaign ? (
          <Panel><EmptyState title="Campaign not found" description="Check the link or ask the organisation to share a new one." /></Panel>
        ) : (
          <Panel className="overflow-hidden">
            <div className="bg-primary-soft p-6 sm:p-8">
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-card text-primary">
                <Megaphone className="h-6 w-6" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-bold sm:text-3xl">Join this campaign</h1>
                <StatusBadge status={campaign.status} />
              </div>
              <h2 className="mt-4 text-xl font-semibold">{campaign.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {campaign.shortDescription || campaign.description || "Your organisation invited you to take part in this campaign."}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Campaign code: <span className="font-mono font-semibold text-foreground">{campaign.joinCode}</span>
              </p>
            </div>

            <div className="space-y-4 p-6 sm:p-8">
              {joined || alreadyJoined ? (
                <div className="space-y-4 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                  <div>
                    <h3 className="font-semibold">{alreadyJoined ? "You're already part of this campaign" : "You've joined the campaign"}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {alreadyJoined ? "You can find it in your campaigns." : "You can now create a fundraising page or view your campaigns."}
                    </p>
                  </div>
                  <div className="flex flex-col justify-center gap-2 sm:flex-row">
                    {!alreadyJoined && <Button asChild><Link to="/member/fundraising-pages/create" search={{ campaign: campaign.id }}>Create a fundraising page</Link></Button>}
                    <Button asChild variant="outline"><Link to="/member/campaigns">My campaigns</Link></Button>
                  </div>
                </div>
              ) : user?.role === "MEMBER" && user.orgId === campaign.orgId ? (
                <>
                  <p className="text-sm text-muted-foreground">Join your team and start fundraising for this campaign.</p>
                  <Button className="w-full" onClick={() => void join()} disabled={joining}>
                    {joining && <Loader2 className="h-4 w-4 animate-spin" />}
                    {joining ? "Joining campaign…" : "Join campaign"}
                  </Button>
                </>
              ) : user ? (
                <div className="space-y-3">
                  <p role="alert" className="text-sm text-destructive">
                    Sign in with an active member account from this organisation to join this campaign.
                  </p>
                  {user.role === "MEMBER" && <Button asChild variant="outline" className="w-full"><Link to="/login" search={{ campaignCode: campaign.joinCode, invite }}>Switch account</Link></Button>}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Sign in to join, or create an account if you’re new to FundR.
                  </p>
                  <Button asChild className="w-full">
                    <Link to="/login" search={{ campaignCode: campaign.joinCode, invite }}>Log in to join</Link>
                  </Button>
                  {canRegister ? (
                    <Button asChild variant="outline" className="w-full">
                      <Link to="/register" search={{ campaignCode: campaign.joinCode, invite }}>Create an account and join</Link>
                    </Button>
                  ) : (
                    <p role={inviteError ? "alert" : "status"} className="text-center text-xs text-muted-foreground">
                      {inviteError || "To create an account, ask your organisation administrator for a current member invitation."}
                    </p>
                  )}
                </div>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {inviteError && user && <p role="status" className="text-xs text-muted-foreground">{inviteError}</p>}
            </div>
          </Panel>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
