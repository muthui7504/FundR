import { createFileRoute } from "@tanstack/react-router";
import { Crown, ShieldCheck } from "lucide-react";
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
      <PageHeader
        title="Staff & access"
        description="Manage the people who help run your organisation on FundR."
      />
      <Panel className="mb-5 overflow-hidden">
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="flex gap-4 p-5 sm:p-6">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning">
              <Crown className="size-5" />
            </div>
            <div>
              <p className="font-semibold">Administrator</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Full access to organisation settings, M-Pesa, campaign billing, and staff roles.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-5 sm:p-6">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="font-semibold">Staff</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Can manage campaigns and members, including campaign upgrades, without access to
                payment or staff settings.
              </p>
            </div>
          </div>
        </div>
      </Panel>
      <MemberDirectory staffOnly />
    </>
  );
}
