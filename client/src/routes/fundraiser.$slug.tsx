import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Copy, ImageIcon, MessageCircle, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, Panel, ProgressBar } from "@/components/kit";
import { FundraiserPageSkeleton } from "@/components/loading-skeletons";
import { PublicFooter, PublicHeader } from "@/components/layout/PublicChrome";
import {
  ContributeForm,
  CONTRIBUTE_FORM_ID,
  type PayState,
} from "@/components/public-fundraising/ContributeForm";
import { PledgeForm } from "@/components/public-fundraising/PledgeForm";
import { ApiError, api } from "@/services/api";
import type { PublicFundraisingProfile } from "@/types";
import { formatDate, formatKES, pct, supporterLabel } from "@/utils/format";
import { publicAppUrl } from "@/utils/public-url";
import { cn } from "@/lib/utils";
import { SAMPLE_FUNDRAISING_SLUG, sampleFundraisingPage } from "@/data/sample-fundraising-page";

export const Route = createFileRoute("/fundraiser/$slug")({
  head: ({ params }) => {
    return {
      meta: [
        { title: "Fundraising page — Fundraise" },
        { name: "description", content: "Support this fundraiser with M-Pesa." },
      ],
    };
  },
  component: FundraiserPage,
});

function FundraiserPage() {
  const { slug } = Route.useParams();
  const [data, setData] = useState<PublicFundraisingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"give" | "pledge">("give");
  const [formState, setFormState] = useState<PayState>("ready");
  const [giveValue, setGiveValue] = useState(500);
  const [campaignDetailsOpen, setCampaignDetailsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotFound(false);
    setData(null);
    if (slug === SAMPLE_FUNDRAISING_SLUG) {
      setData(sampleFundraisingPage);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    void api.profiles
      .bySlug(slug)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setNotFound(true);
          return;
        }
        setError(cause instanceof Error ? cause.message : "Unable to load this fundraising page.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, attempt]);
  if (loading)
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <FundraiserPageSkeleton />
      </div>
    );
  if (notFound)
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="mx-auto max-w-xl py-20">
          <Panel>
            <EmptyState
              title="Fundraising page not found"
              description="This page is no longer available because its campaign is not active."
              action={
                <Button asChild>
                  <Link to="/">Go home</Link>
                </Button>
              }
            />
          </Panel>
        </div>
        <PublicFooter />
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="mx-auto max-w-xl px-4 py-12">
          <Panel>
            <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />
          </Panel>
        </div>
        <PublicFooter />
      </div>
    );
  const p = data?.profile;
  const c = data?.campaign;
  if (!p || !c || !data)
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="mx-auto max-w-xl py-20">
          <Panel>
            <EmptyState
              title="Fundraising page not found"
              description="The link may be incorrect or the page was removed."
              action={
                <Button asChild>
                  <Link to="/">Go home</Link>
                </Button>
              }
            />
          </Panel>
        </div>
      </div>
    );
  const coverImage = p.coverImageUrl ?? c.coverImageUrl ?? null;
  const campaignImages = Array.from(
    new Set([...(c.imageUrls ?? []), ...(c.coverImageUrl ? [c.coverImageUrl] : [])]),
  );
  const m = data.member;
  const org = data.organisation;
  const done = data.contributions.filter((x) => x.status === "COMPLETED");
  const raised = done.reduce((total, item) => total + item.amount, 0);
  const accepting = c.status === "ACTIVE" && p.status === "PUBLISHED";
  const url =
    typeof window !== "undefined"
      ? window.location.href
      : publicAppUrl(`/fundraiser/${p.slug}`);
  return (
    <div className="min-h-screen bg-background pb-24">
      <PublicHeader />
      {slug === SAMPLE_FUNDRAISING_SLUG && (
        <div className="border-b bg-primary/5 px-4 py-3 text-center text-sm text-primary">
          <span className="font-semibold">Sample fundraising page</span>
          <span className="hidden sm:inline">
            {" "}
            — This preview uses example information. Payments and pledges are disabled.
          </span>
        </div>
      )}
      <div className="relative h-40 overflow-hidden bg-hero sm:h-56">
        {coverImage && (
          <img
            src={coverImage}
            alt={`${p.title} cover`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <div className="mx-auto -mt-20 max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <Panel className="p-6">
              <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-full border-4 border-card bg-primary-soft text-2xl font-bold text-primary">
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt={`${m.name} profile`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  m.name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")
                )}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {m.name} is fundraising for{" "}
                <span className="font-medium text-foreground">{c.name}</span>
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{p.title}</h1>
              <p className="mt-4 whitespace-pre-line leading-relaxed text-muted-foreground">
                {p.message}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(url);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Support ${m.name}: ${p.title} ${url}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Share on WhatsApp
                  </a>
                </Button>
              </div>
            </Panel>
            <Panel className="space-y-4 p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Wanjiku’s fundraising progress</p>
                  <p className="mt-1 text-2xl font-bold">{formatKES(raised)}</p>
                </div>
                <p className="text-right text-sm text-muted-foreground">
                  of {formatKES(p.target ?? c.target)}
                  <span className="mt-1 block font-medium text-foreground">
                    {pct(raised, p.target ?? c.target)}% raised
                  </span>
                </p>
              </div>
              <ProgressBar value={pct(raised, p.target ?? c.target)} />
              <p className="text-xs text-muted-foreground">
                Every contribution helps Grace Community Church complete its community hall.
              </p>
            </Panel>
            <Panel className="p-6">
              <h2 className="font-semibold">About the organisation</h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {c.description || c.shortDescription}
              </p>
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-muted p-4">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-semibold">{org.name || "Grace Church"}</p>
                  <p className="text-muted-foreground">
                    {org.type || "Church"} · {org.city || "Nairobi"}, {org.country || "Kenya"}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-muted-foreground">
                    {org.description ||
                      "A welcoming community church in Westlands serving families across Nairobi since 1998."}
                  </p>
                </div>
              </div>
            </Panel>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setCampaignDetailsOpen(true)}
            >
              <ImageIcon className="size-4" />
              View photos / more details
            </Button>
          </div>
          <div className="lg:col-span-2">
            <Panel className="space-y-5 p-6 lg:sticky lg:top-20">
              {!accepting && (
                <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
                  This page isn't accepting contributions right now.
                </p>
              )}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                {(["give", "pledge"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-lg py-2 text-sm font-medium",
                      tab === t ? "bg-card shadow-card" : "text-muted-foreground",
                    )}
                  >
                    {t === "give" ? "Give now" : "Pledge"}
                  </button>
                ))}
              </div>
              {slug === SAMPLE_FUNDRAISING_SLUG ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {tab === "give" ? "Choose an amount to give" : "Make a pledge"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tab === "give"
                        ? "Support this campaign securely with M-Pesa."
                        : "Choose an amount and a date you expect to pay."}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[500, 1000, 2500].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        disabled
                        className="h-10 rounded-xl border bg-card text-sm font-semibold text-muted-foreground"
                      >
                        {amount.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="h-10 rounded-xl border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      M-Pesa phone number
                    </div>
                    <Button type="button" className="h-11 w-full rounded-xl" disabled>
                      {tab === "give" ? "Contribute with M-Pesa" : "Record sample pledge"}
                    </Button>
                  </div>
                  <p className="rounded-xl bg-muted p-3 text-center text-xs text-muted-foreground">
                    Preview only — no payment or pledge will be submitted.
                  </p>
                </div>
              ) : tab === "give" ? (
                <ContributeForm profileId={p.id} onState={setFormState} onValue={setGiveValue} />
              ) : (
                <PledgeForm
                  campaignEndDate={c.endDate}
                  onCreate={async (d) => {
                    await api.pledges.create({
                      ...d,
                      profileId: p.id,
                      campaignId: c.id,
                    });
                    toast.success("Pledge recorded.");
                  }}
                />
              )}
            </Panel>
          </div>
        </div>
        <Panel className="mt-6">
          <h2 className="border-b p-5 font-semibold">
            {slug === SAMPLE_FUNDRAISING_SLUG ? "Sample recent supporters" : "Recent supporters"}
          </h2>
          {done.length === 0 ? (
            <EmptyState title="Be the first to give" />
          ) : (
            <ul className="divide-y">
              {done.slice(0, 8).map((x) => (
                <li key={x.id} className="flex items-center gap-3 p-4 text-sm">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{supporterLabel(x.supporterName)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(x.createdAt)}</p>
                  </div>
                  <span className="font-semibold">{formatKES(x.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {slug !== SAMPLE_FUNDRAISING_SLUG && tab === "give" && formState === "ready" && (
        <div
          style={{ position: "fixed", left: 0, right: 0, bottom: 0 }}
          className="z-50 border-t bg-background shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]"
        >
          <div
            className="mx-auto flex max-w-6xl justify-end px-4 pt-3 sm:px-6"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <Button
              type="submit"
              form={CONTRIBUTE_FORM_ID}
              className="h-11 w-full rounded-xl px-5 sm:w-auto"
            >
              Contribute —{" "}
              {formatKES(Number.isFinite(giveValue) && giveValue > 0 ? giveValue : 500)}
            </Button>
          </div>
        </div>
      )}
      <Dialog open={campaignDetailsOpen} onOpenChange={setCampaignDetailsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{c.name}</DialogTitle>
            <DialogDescription>
              {c.shortDescription || "Campaign details and project photos"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {c.description ||
                c.shortDescription ||
                "More information about this campaign will be shared by the organisation."}
            </p>
            {campaignImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {campaignImages.map((image, index) => (
                  <CampaignPhoto
                    key={`${image}-${index}`}
                    src={image}
                    alt={`${c.name} project photo ${index + 1}`}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed bg-muted/30 px-5 py-8 text-center">
                <ImageIcon className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium">Project photos coming soon</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The organisation has not added campaign photos yet.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <PublicFooter />
    </div>
  );
}

function CampaignPhoto({ src, alt }: { src: string; alt: string }) {
  const [unavailable, setUnavailable] = useState(false);
  return unavailable ? (
    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
      <ImageIcon className="size-6" aria-hidden="true" />
      Photo unavailable
    </div>
  ) : (
    <img
      src={src}
      alt={alt}
      className="aspect-[4/3] w-full rounded-xl border object-cover"
      onError={() => setUnavailable(true)}
    />
  );
}
