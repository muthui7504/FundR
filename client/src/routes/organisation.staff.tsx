import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/kit";
import { MemberDirectory } from "@/components/organisation/MemberDirectory";
import { meta } from "@/utils/meta";
import { requireAuth } from "@/lib/auth";

export const Route = createFileRoute("/organisation/staff")({
  beforeLoad: () => requireAuth(["ORGANISATION_ADMIN"]),
  head: () => meta("Staff", "Manage administrators and staff who run your campaigns."),
  component: Staff,
});

function Staff() {
  return (
    <>
      <PageHeader title="Staff" description="Admins and staff who manage campaigns and members." />
      <Panel className="mb-4 grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div><p className="font-semibold">Admin</p><p className="text-muted-foreground">Full access, including M-Pesa settings, campaign billing and staff roles.</p></div>
        <div><p className="font-semibold">Staff</p><p className="text-muted-foreground">Manage campaigns and members, including campaign plan upgrades. Cannot change M-Pesa settings or staff roles.</p></div>
      </Panel>
      <MemberDirectory staffOnly />
    </>
  );
}
