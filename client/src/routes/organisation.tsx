import { createFileRoute } from "@tanstack/react-router";
import { Building2, LayoutDashboard, Megaphone, Smartphone, UserCog, Users } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SessionGate } from "@/components/layout/SessionGate";
import { requireAuth } from "@/lib/auth";
import { useDemo } from "@/context/DemoStore";

export const Route = createFileRoute("/organisation")({
  beforeLoad: () => requireAuth(["ORGANISATION_ADMIN", "ORGANISATION_STAFF"]),
  component: Layout,
});

const items = [
  { to: "/organisation", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/organisation/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/organisation/members", label: "Members", icon: Users },
  { to: "/organisation/staff", label: "Staff", icon: UserCog },
  { to: "/organisation/settings", label: "Organisation Settings", icon: Building2 },
  { to: "/organisation/mpesa", label: "M-Pesa Settings", icon: Smartphone },
];

function Layout() {
  const { org, user } = useDemo();
  const userName = user ? `${user.firstName} ${user.lastName}`.trim() : "Organisation user";
  const role = user?.role === "ORGANISATION_STAFF" ? "Organisation staff" : "Organisation admin";
  const isAdmin = user?.role === "ORGANISATION_ADMIN";
  const visibleItems = isAdmin
    ? items
    : items.filter(
        (item) =>
          item.to !== "/organisation/staff" &&
          item.to !== "/organisation/settings" &&
          item.to !== "/organisation/mpesa",
      );
  return (
    <SessionGate>
      <DashboardShell
        items={visibleItems}
        area={org.name || "Organisation"}
        user={{ name: userName, sub: role }}
      />
    </SessionGate>
  );
}
