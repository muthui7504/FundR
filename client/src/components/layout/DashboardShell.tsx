import { useState, type ReactNode } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { Bell, Building2, Loader2, Menu, UserRound, type LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useDemo } from "@/context/DemoStore";

export interface NavItem { to: string; label: string; icon: LucideIcon; exact?: boolean }

function Nav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {items.map((it) => (
        <Link key={it.to} to={it.to} onClick={onNavigate} activeOptions={{ exact: !!it.exact }}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          activeProps={{ className: "!bg-primary-soft !text-primary" }}>
          <it.icon className="h-4 w-4 shrink-0" />{it.label}
        </Link>
      ))}
    </nav>
  );
}

function mobileLabel(label: string) {
  const labels: Record<string, string> = {
    "My Campaigns": "Campaigns",
    "My Fundraising Pages": "Pages",
    "Contribution History": "History",
    "Payments & billing": "Payments",
    Organisations: "Orgs",
  };
  return labels[label] ?? label;
}

export function DashboardShell({ items, area, user, footer }: { items: NavItem[]; area: string; user: { name: string; sub: string }; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { loading, loadError, retry, user: authUser } = useDemo();
  const signOut = async () => {
    try {
      await api.auth.logout();
      window.dispatchEvent(new Event("fundraise:auth-change"));
      await navigate({ to: "/login", search: { campaignCode: undefined, invite: undefined }, replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
    }
  };
  const side = (onNav?: () => void) => (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1"><Logo /></div>
      <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{area}</p>
      <Nav items={items} onNavigate={onNav} />
      <div className="mt-auto space-y-3">
        {footer}
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{user.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}</div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.sub}</p></div>
        </div>
        <button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LogOut className="h-4 w-4" />Sign out
        </button>
        <Link to="/" className="block px-3 text-xs text-muted-foreground hover:text-foreground">← Back to website</Link>
      </div>
    </div>
  );
  return (
    <div className="min-h-dvh bg-background bg-hero">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar lg:block">{side()}</aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent id="dashboard-mobile-navigation" side="left" className="w-72 p-0"><SheetTitle className="sr-only">Navigation</SheetTitle>{side(() => setOpen(false))}</SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl sm:px-6">
          <button type="button" className="grid h-11 w-11 place-items-center rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="dashboard-mobile-navigation"><Menu className="h-5 w-5" /></button>
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            {authUser?.memberId &&
              (authUser.role === "ORGANISATION_ADMIN" ||
                authUser.role === "ORGANISATION_STAFF") && <MemberRoleSwitcher />}
            <button type="button" className="grid h-11 w-11 place-items-center rounded-xl border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Notifications"><Bell className="h-4 w-4" /></button>
          </div>
        </header>
        <main className={cn("mx-auto max-w-7xl px-3 py-5 pb-28 sm:px-6 sm:py-8 sm:pb-32 lg:pb-8")}>
          {loading && <p role="status" className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing your data…</p>}
          {loadError && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"><span>Some data may be out of date or unavailable. {loadError}</span><button type="button" className="font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50" onClick={retry} disabled={loading}>Retry</button></div>}
          <Outlet />
        </main>
      </div>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border/70 bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-8px_28px_-20px_oklch(0.25_0.06_166_/_0.4)] backdrop-blur-xl lg:hidden"
      >
        {items.slice(0, 3).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: !!item.exact }}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.65rem] font-medium leading-none text-muted-foreground transition-colors active:bg-muted"
            activeProps={{ className: "!text-primary" }}
          >
            <item.icon className="size-[1.15rem] shrink-0" />
            <span className="max-w-full truncate">{mobileLabel(item.label)}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.65rem] font-medium leading-none text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open all dashboard sections"
        >
          <Menu className="size-[1.15rem] shrink-0" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

function MemberRoleSwitcher() {
  return (
    <div
      role="group"
      className="flex items-center gap-1 rounded-xl border bg-card p-1 text-xs"
      aria-label="Switch dashboard role"
    >
      <Link
        to="/organisation"
        className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        activeProps={{ className: "!bg-primary !text-primary-foreground" }}
        aria-label="Organisation dashboard"
        title="Organisation dashboard"
      >
        <Building2 className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Organisation</span>
      </Link>
      <Link
        to="/member"
        className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        activeProps={{ className: "!bg-primary !text-primary-foreground" }}
        aria-label="Member dashboard"
        title="Member dashboard"
      >
        <UserRound className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Member</span>
      </Link>
    </div>
  );
}
