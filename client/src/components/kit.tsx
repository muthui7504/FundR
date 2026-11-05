import { useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-w-0 rounded-2xl border bg-card shadow-card", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "primary" }: { label: string; value: string; hint?: string; icon?: ReactNode; tone?: "primary" | "warning" | "info" | "muted" }) {
  const tones = { primary: "bg-primary-soft text-primary", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info", muted: "bg-muted text-muted-foreground" };
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}>{icon}</div>}
      </div>
    </Panel>
  );
}

export function ProgressBar({ value, className, size = "md" }: { value: number; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : "h-2.5", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

const toneMap: Record<string, string> = {
  ACTIVE: "bg-success-soft text-success", COMPLETED: "bg-success-soft text-success", FULFILLED: "bg-success-soft text-success", PUBLISHED: "bg-success-soft text-success",
  DRAFT: "bg-muted text-muted-foreground", ARCHIVED: "bg-muted text-muted-foreground", LEFT: "bg-muted text-muted-foreground", CANCELLED: "bg-muted text-muted-foreground", EXPIRED: "bg-muted text-muted-foreground", REMOVED: "bg-muted text-muted-foreground",
  PAUSED: "bg-warning-soft text-warning", PENDING: "bg-warning-soft text-warning", DUE_SOON: "bg-warning-soft text-warning", INVITED: "bg-info-soft text-info", TRIAL: "bg-info-soft text-info", GRACE_PERIOD: "bg-warning-soft text-warning", PAST_DUE: "bg-warning-soft text-warning",
  OVERDUE: "bg-danger-soft text-destructive", FAILED: "bg-danger-soft text-destructive", SUSPENDED: "bg-danger-soft text-destructive", REVERSED: "bg-danger-soft text-destructive", REFUNDED: "bg-info-soft text-info",
  ADMIN: "bg-ink text-ink-foreground", STAFF: "bg-primary-soft text-primary", MEMBER: "bg-muted text-foreground",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", toneMap[status] ?? "bg-muted text-foreground")}>
      {status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Inbox className="h-5 w-5" /></div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center py-14 text-center" role="alert">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="mt-3 text-sm">{message}</p>
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search…"} aria-label={placeholder ?? "Search"}
        className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
  );
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={cn("min-h-10 rounded-full border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", value === o ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
          {o === "ALL" ? "All" : o.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
export const inputCls = "h-11 w-full rounded-xl border bg-card px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive";
export const textareaCls = "min-h-28 w-full rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">Page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button size="sm" className="min-h-11 px-4" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button size="sm" className="min-h-11 px-4" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
export function usePaged<T>(items: T[], size = 8) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, pages);
  return { page: p, pages, setPage, rows: items.slice((p - 1) * size, p * size) };
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", destructive, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
