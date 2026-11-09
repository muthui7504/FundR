import { createFileRoute } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";
import { PageHeader, Panel } from "@/components/kit";
import { MemberDirectory } from "@/components/organisation/MemberDirectory";
import { useDemo } from "@/context/DemoStore";
import { meta } from "@/utils/meta";

export const Route = createFileRoute("/organisation/members")({
  head: () => meta("Members", "Search, manage roles and access for your organisation's members."),
  component: Members,
});

function Members() {
  const { org } = useDemo();
  return (
    <>
      <PageHeader
        title="Members"
        description={`Build your fundraising community at ${org.name || "your organisation"}.`}
      />
      <Panel className="mb-5 flex items-center gap-4 overflow-hidden border-primary/15 bg-gradient-to-r from-card via-card to-primary-soft/50 p-4 sm:p-5">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
          <UsersRound className="size-6" />
        </div>
        <div>
          <p className="font-semibold">Your community, all in one place</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Find people, follow membership status, and invite new members to join your campaigns.
          </p>
        </div>
      </Panel>
      <MemberDirectory />
    </>
  );
}
