import { Link } from "@tanstack/react-router";
import { HandCoins } from "lucide-react";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-bold text-foreground">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground"><HandCoins className="h-4 w-4" /></span>
      <span className="text-lg tracking-tight">FundR</span>
    </Link>
  );
}
