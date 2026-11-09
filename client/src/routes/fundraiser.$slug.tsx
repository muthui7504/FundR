import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Heart,
  ImageIcon,
  Maximize2,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
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
        { title: "Fundraising page — FundR" },
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
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const campaignImages = Array.from(
    new Set([
      ...(data?.campaign.imageUrls ?? []),
      ...(data?.campaign.coverImageUrl ? [data.campaign.coverImageUrl] : []),
    ]),
  );
  const movePhoto = (direction: -1 | 1) => {
    if (selectedPhotoIndex === null || campaignImages.length < 2) return;
    setSelectedPhotoIndex(
      (selectedPhotoIndex + direction + campaignImages.length) % campaignImages.length,
    );
  };
  useEffect(() => {
    if (selectedPhotoIndex === null || campaignImages.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        setSelectedPhotoIndex((index) =>
          index === null ? null : (index - 1 + campaignImages.length) % campaignImages.length,
        );
      }
      if (event.key === "ArrowRight") {
        setSelectedPhotoIndex((index) =>
          index === null ? null : (index + 1) % campaignImages.length,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPhotoIndex, campaignImages.length]);
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
  const showPhoto = (index: number) => setSelectedPhotoIndex(index);
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
      <div className="relative h-48 overflow-hidden bg-hero sm:h-64 lg:h-72">
        {coverImage && (
          <img
            src={coverImage}
            alt={`${p.title} cover`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/5" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-8 text-white sm:px-6 sm:pb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/25 px-3 py-1 text-xs font-medium backdrop-blur">
            <Heart className="size-3.5" />
            {c.name}
          </span>
        </div>
      </div>
      <div className="relative mx-auto -mt-16 max-w-6xl px-4 pb-16 sm:-mt-20 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <Panel className="overflow-hidden p-0">
              <div className="h-2 bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
              <div className="p-5 sm:p-7">
              <div className="relative grid size-20 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-primary-soft text-2xl font-bold text-primary shadow-md sm:size-24">
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
              <p className="mt-5 text-sm font-medium text-primary">
                {m.name} is fundraising for {c.name}
              </p>
              <h1 className="mt-2 break-words font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                {p.title}
              </h1>
              <p className="mt-4 whitespace-pre-line leading-7 text-muted-foreground">
                {p.message}
              </p>
              <div className="mt-6 flex flex-col gap-2 border-t pt-5 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    navigator.clipboard?.writeText(url);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
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
              </div>
            </Panel>
            <Panel className="overflow-hidden p-0">
              <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{m.name}’s fundraising progress</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-primary">{formatKES(raised)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    raised from {done.length} verified contribution{done.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="shrink-0 rounded-2xl border border-primary/10 bg-background/80 px-3 py-2 text-right shadow-sm">
                  <span className="block text-lg font-bold text-foreground">{pct(raised, p.target ?? c.target)}%</span>
                  <span className="text-[11px] text-muted-foreground">of goal</span>
                </span>
              </div>
              <ProgressBar value={pct(raised, p.target ?? c.target)} className="mt-5" />
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Goal: {formatKES(p.target ?? c.target)}</span>
                <span>{formatKES(Math.max(0, (p.target ?? c.target) - raised))} to go</span>
              </div>
              </div>
            </Panel>
            <Panel className="p-6">
              <h2 className="font-semibold">About the organisation</h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {c.description || c.shortDescription}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 w-full sm:w-auto"
                onClick={() => setCampaignDetailsOpen(true)}
              >
                <ImageIcon className="size-4" />
                View photos / more details
              </Button>
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-muted p-4">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-semibold">{org.name || "Grace Church"}</p>
                  <p className="text-muted-foreground">
                    {org.type || "Church"} · {org.city || "Nairobi"}, {org.country || "Kenya"}
                  </p>
                  {org.description && (
                    <p className="mt-2 whitespace-pre-line text-muted-foreground">
                      {org.description}
                    </p>
                  )}
                </div>
              </div>
            </Panel>
          </div>
          <div className="lg:col-span-2">
            <Panel className="overflow-hidden p-0 lg:sticky lg:top-20">
              <div className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <Heart className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-bold">Make a difference</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Your support helps {c.name}.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-5 p-5 sm:p-6">
              {!accepting && (
                <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
                  This page isn't accepting contributions right now.
                </p>
              )}
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted/80 p-1.5">
                {(["give", "pledge"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "min-h-11 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      tab === t
                        ? "bg-card text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
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
              <div className="flex items-center justify-center gap-2 border-t pt-4 text-center text-xs text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-primary" />
                <span>
                  {tab === "give"
                    ? "Secure M-Pesa payment · PIN stays private"
                    : "Pledges are tracked separately until paid"}
                </span>
              </div>
              </div>
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
        <DialogContent className="overflow-hidden border-0 bg-background p-0 shadow-2xl sm:max-w-3xl">
          <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-5 pb-5 pt-7 sm:px-7">
            <DialogHeader>
              <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <ImageIcon className="size-5" aria-hidden="true" />
              </div>
              <DialogTitle className="font-display text-xl sm:text-2xl">{c.name}</DialogTitle>
              <DialogDescription className="max-w-2xl text-sm leading-relaxed">
                {c.shortDescription || "Discover the project and see its progress."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[calc(100dvh-12rem)] space-y-6 overflow-y-auto px-5 pb-6 sm:px-7">
            <section aria-label="Campaign description" className="rounded-2xl border bg-card p-4 sm:p-5">
              <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {c.description ||
                  c.shortDescription ||
                  "More information about this campaign will be shared by the organisation."}
              </p>
            </section>
            <section aria-label="Project photos">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Project photos</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tap any photo to view it full size.
                  </p>
                </div>
                {campaignImages.length > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {campaignImages.length} {campaignImages.length === 1 ? "photo" : "photos"}
                  </span>
                )}
              </div>
              {campaignImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {campaignImages.map((image, index) => (
                    <CampaignPhoto
                      key={`${image}-${index}`}
                      src={image}
                      alt={`${c.name} project photo ${index + 1}`}
                      onClick={() => showPhoto(index)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center rounded-2xl border border-dashed bg-muted/30 px-5 py-9 text-center">
                  <span className="grid size-12 place-items-center rounded-2xl bg-background text-primary shadow-sm">
                    <ImageIcon className="size-6" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">Project photos coming soon</p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                    The organisation has not added campaign photos yet.
                  </p>
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={selectedPhotoIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPhotoIndex(null);
        }}
      >
        <DialogContent className="flex h-[min(92dvh,900px)] max-h-[92dvh] w-[calc(100%-1rem)] max-w-6xl flex-col gap-3 border-white/10 bg-black/95 p-3 text-white sm:w-[calc(100%-2rem)] sm:p-5">
          <DialogHeader className="shrink-0 pr-8 text-left">
            <DialogTitle className="text-sm font-medium text-white">
              {selectedPhotoIndex !== null
                ? `${c.name} · Photo ${selectedPhotoIndex + 1} of ${campaignImages.length}`
                : c.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-white/60">
              Use the arrows or keyboard arrow keys to browse photos.
            </DialogDescription>
          </DialogHeader>
          {selectedPhotoIndex !== null && campaignImages[selectedPhotoIndex] && (
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              <img
                src={campaignImages[selectedPhotoIndex]}
                alt={`${c.name} project photo ${selectedPhotoIndex + 1}`}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
              {campaignImages.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => movePhoto(-1)}
                    className="absolute left-2 grid size-10 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 transition hover:bg-black/85 sm:left-4 sm:size-12"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => movePhoto(1)}
                    className="absolute right-2 grid size-10 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 transition hover:bg-black/85 sm:right-4 sm:size-12"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PublicFooter />
    </div>
  );
}

function CampaignPhoto({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick: () => void;
}) {
  const [unavailable, setUnavailable] = useState(false);
  return unavailable ? (
    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
      <ImageIcon className="size-6" aria-hidden="true" />
      Photo unavailable
    </div>
  ) : (
    <button
      type="button"
      className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border bg-muted text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      aria-label={`View full-size image: ${alt}`}
    >
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-105"
        onError={() => setUnavailable(true)}
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-70 transition group-hover:opacity-100" />
      <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-black/55 text-white opacity-0 shadow transition group-hover:opacity-100 group-focus-visible:opacity-100">
        <Maximize2 className="size-4" aria-hidden="true" />
      </span>
    </button>
  );
}
