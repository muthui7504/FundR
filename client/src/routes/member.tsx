
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CalendarClock,
  FileHeart,
  LayoutDashboard,
  Megaphone,
  Receipt,
  UserPlus,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SessionGate } from "@/components/layout/SessionGate";
import { requireAuth } from "@/lib/auth";
import { useDemo } from "@/context/DemoStore";

export const Route = createFileRoute("/member")({
  beforeLoad: async () => {
    const user = await requireAuth([
      "MEMBER",
      "ORGANISATION_ADMIN",
      "ORGANISATION_STAFF",
    ]);
    if (user && user.role !== "MEMBER" && !user.memberId)
      throw redirect({ to: "/organisation" });
    return user;
  },
  component: Layout,
});

const items = [
  { to: "/member", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/member/campaigns", label: "My Campaigns", icon: Megaphone },
  {
    to: "/member/fundraising-pages",
    label: "My Fundraising Pages",
    icon: FileHeart,
  },
  { to: "/member/pledges", label: "My Pledges", icon: CalendarClock },
  {
    to: "/member/contributions",
    label: "Contribution History",
    icon: Receipt,
  },
  {
    to: "/member/join-campaign",
    label: "Join a Campaign",
    icon: UserPlus,
  },
];

function Layout() {
  const { org, user } = useDemo();
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : "Member";
  return (
    <SessionGate>
      <DashboardShell
        items={items}
        area="Member"
        user={{ name: userName, sub: org.name || "Member" }}
      />
    </SessionGate>
  );
}
