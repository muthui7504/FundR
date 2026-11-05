import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DashboardLoadingSkeleton } from "@/components/loading-skeletons";
import { useDemo } from "@/context/DemoStore";

export function SessionGate({ children }: { children: ReactNode }) {
  const { loading, initialized, user } = useDemo();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/login", search: { campaignCode: undefined, invite: undefined }, replace: true });
  }, [loading, user, navigate]);

  if (!initialized || (loading && !user) || !user) return <DashboardLoadingSkeleton />;
  return children;
}
