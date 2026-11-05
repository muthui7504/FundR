import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={`h-3 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-5 shadow-card ${className}`} aria-hidden="true">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="mt-4 h-7 w-1/2" />
      <Skeleton className="mt-3 h-3 w-3/4" />
    </div>
  );
}

export function SkeletonStats({
  count = 4,
  announce = true,
}: {
  count?: number;
  announce?: boolean;
}) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      role={announce ? "status" : undefined}
      aria-label={announce ? "Loading summary" : undefined}
      aria-busy={announce || undefined}
      aria-hidden={announce ? undefined : true}
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  announce = true,
}: {
  rows?: number;
  columns?: number;
  announce?: boolean;
}) {
  return (
    <div
      className="space-y-4 p-4"
      role={announce ? "status" : undefined}
      aria-label={announce ? "Loading table" : undefined}
      aria-busy={announce || undefined}
      aria-hidden={announce ? undefined : true}
    >
      <div className="flex gap-4 border-b pb-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={`h-4 flex-1 ${column === 0 ? "max-w-48" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 4, announce = true }: { rows?: number; announce?: boolean }) {
  return (
    <div
      className="divide-y"
      role={announce ? "status" : undefined}
      aria-label={announce ? "Loading list" : undefined}
      aria-busy={announce || undefined}
      aria-hidden={announce ? undefined : true}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <div
      className="min-h-screen bg-background"
      role="status"
      aria-label="Loading your dashboard"
      aria-busy="true"
    >
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar p-5 lg:block">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-8 h-3 w-24" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <div className="absolute bottom-5 left-5 right-5">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6">
          <Skeleton className="h-9 w-9 rounded-xl lg:hidden" />
          <Skeleton className="h-9 w-28" />
        </header>
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <SkeletonStats announce={false} />
          <div className="grid gap-6 lg:grid-cols-3">
            <SkeletonCard className="min-h-64 lg:col-span-2" />
            <SkeletonCard className="min-h-64" />
          </div>
          <SkeletonCard className="min-h-36" />
        </main>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function FundraiserPageSkeleton() {
  return (
    <div
      className="min-h-screen bg-background"
      role="status"
      aria-label="Loading fundraiser"
      aria-busy="true"
    >
      <Skeleton className="h-40 rounded-none sm:h-56" />
      <div className="mx-auto -mt-20 max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <div className="rounded-2xl border bg-card p-6">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="mt-5 h-4 w-2/3" />
              <Skeleton className="mt-3 h-9 w-4/5" />
              <SkeletonText lines={3} className="mt-5" />
            </div>
            <div className="rounded-2xl border bg-card p-6">
              <Skeleton className="h-5 w-1/3" />
              <SkeletonText lines={3} className="mt-4" />
            </div>
          </div>
          <div className="h-fit space-y-5 rounded-2xl border bg-card p-6 lg:col-span-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-5 h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
        <div className="mt-6 rounded-2xl border bg-card">
          <Skeleton className="m-5 h-5 w-1/3" />
          <SkeletonList rows={3} announce={false} />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading details" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <SkeletonStats announce={false} />
      <SkeletonCard className="min-h-32" />
      <SkeletonTable rows={4} columns={5} announce={false} />
    </div>
  );
}
