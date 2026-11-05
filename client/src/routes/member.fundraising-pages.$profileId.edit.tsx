import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/kit";
import { ProfileForm } from "@/components/member/ProfileForm";
import { useDemo } from "@/context/DemoStore";
import { meta } from "@/utils/meta";
import { api } from "@/services/api";

export const Route = createFileRoute("/member/fundraising-pages/$profileId/edit")({
  head: () => meta("Edit fundraising page", "Update your fundraising page's message, target and images."),
  component: Edit,
});

function Edit() {
  const nav = useNavigate();
  const { profileId } = Route.useParams();
  const { profiles, setProfiles, campaigns, memberId } = useDemo();
  const p = profiles.find((x) => x.id === profileId && x.memberId === memberId);
  if (!p) return <Panel><EmptyState title="Page not found" action={<Button asChild><Link to="/member/fundraising-pages">Back</Link></Button>} /></Panel>;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Edit fundraising page" description={p.title} />
      <Panel className="p-5 sm:p-6">
        <ProfileForm lockCampaign eligible={campaigns.filter((c) => c.id === p.campaignId)} initial={p} submitLabel="Save changes"
          onCancel={() => nav({ to: "/member/fundraising-pages" })}
          onSubmit={async (v, draft) => {
            try {
              const updated = await api.profiles.update(p.id, { ...v, status: draft ? "DRAFT" : "PUBLISHED" });
              setProfiles((ps) => ps.map((x) => x.id === updated.id ? updated : x));
              toast.success("Changes saved");
              nav({ to: "/member/fundraising-pages" });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Unable to save changes.");
            }
          }} />
      </Panel>
    </div>
  );
}
