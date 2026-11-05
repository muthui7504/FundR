import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/kit";
import { ProfileForm } from "@/components/member/ProfileForm";
import { useDemo } from "@/context/DemoStore";
import { meta } from "@/utils/meta";
import { api } from "@/services/api";

export const Route = createFileRoute("/member/fundraising-pages/create")({
  validateSearch: (s: Record<string, unknown>): { campaign?: string } => ({ campaign: typeof s.campaign === "string" ? s.campaign : undefined }),
  head: () => meta("Create fundraising page", "Create a personal fundraising page for a campaign you've joined."),
  component: Create,
});

function Create() {
  const nav = useNavigate();
  const { campaign } = Route.useSearch();
  const { campaigns, participants, profiles, setProfiles, memberId, user } = useDemo();
  const memberName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  // Eligible: active participation, active campaign, and no existing page (one page per campaign).
  const eligible = campaigns.filter((c) => c.status === "ACTIVE" &&
    participants.some((p) => p.campaignId === c.id && p.memberId === memberId && p.status === "ACTIVE") &&
    !profiles.some((p) => p.campaignId === c.id && p.memberId === memberId));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Create fundraising page" description="You can have one page per campaign." />
      <Panel className="space-y-5 p-5 sm:p-6">
        {eligible.length === 0 ? (
          <EmptyState title="No eligible campaigns" description="Join an active campaign without an existing fundraising page to create a new page."
            action={<Button asChild><Link to="/member/join-campaign">Join a campaign</Link></Button>} />
        ) : (<>
          <ProfileForm eligible={eligible} memberName={memberName} showPrefillNote initial={{ campaignId: eligible.find((c) => c.id === campaign)?.id ?? eligible[0].id }} submitLabel="Create page"
            onCancel={() => nav({ to: "/member/fundraising-pages" })}
            onSubmit={async (v, draft) => {
              if (profiles.some((p) => p.campaignId === v.campaignId && p.memberId === memberId)) {
                toast.error("You already have a page for this campaign.");
                return;
              }
              try {
                const created = await api.profiles.create({ ...v, status: draft ? "DRAFT" : "PUBLISHED" });
                setProfiles((ps) => [...ps, created]);
                toast.success(draft ? "Draft saved" : "Page created");
                nav({ to: "/member/fundraising-pages" });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to create fundraising page.");
              }
            }} />
        </>)}
      </Panel>
    </div>
  );
}
