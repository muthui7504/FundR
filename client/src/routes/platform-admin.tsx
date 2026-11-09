import { createFileRoute } from "@tanstack/react-router";
import { Building2, CreditCard, LayoutDashboard, Megaphone, Settings, UserPlus, WalletCards } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SessionGate } from "@/components/layout/SessionGate";
import { requireAuth } from "@/lib/auth";

export const Route = createFileRoute("/platform-admin")({
  beforeLoad: () => requireAuth(["PLATFORM_ADMIN"]),
  component: Layout,
});

const items = [
  { to: "/platform-admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/platform-admin/organisations", label: "Organisations", icon: Building2 },
  { to: "/platform-admin/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/platform-admin/payments", label: "Payments & billing", icon: CreditCard },
  { to: "/platform-admin/payment-configuration", label: "Payment configuration", icon: WalletCards },
  { to: "/platform-admin/accounts", label: "Create accounts", icon: UserPlus },
  { to: "/platform-admin/plans", label: "Subscription plans", icon: WalletCards },
  { to: "/platform-admin/settings", label: "Platform settings", icon: Settings },
];

function Layout() {
  return (
    <SessionGate>
      <DashboardShell items={items} area="Platform admin" user={{ name: "Platform Admin", sub: "FundR staff" }} />
    </SessionGate>
  );
}
