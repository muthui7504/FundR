import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BarChart3, Building2, CalendarClock, Check, HandCoins, Megaphone, ShieldCheck, Smartphone, Users, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicFooter, PublicHeader } from "@/components/layout/PublicChrome";
import { EmptyState, ErrorState, ProgressBar } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/services/api";
import type { Plan } from "@/types";
import { formatKES } from "@/utils/format";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FundR — Fundraising made simple for Kenyan organisations" },
      { name: "description", content: "Run campaigns, accept M-Pesa contributions, track pledges and empower members with personal fundraising pages." },
      { property: "og:title", content: "FundR — Fundraising made simple" },
      { property: "og:description", content: "Campaigns, M-Pesa contributions and pledge tracking for churches, schools, NGOs and community groups in Kenya." },
    ],
  }),
  component: Home,
});

const features = [
  { icon: Megaphone, title: "Campaign Management", text: "Set targets, dates and join links. Pause, complete or archive with a click." },
  { icon: UserRound, title: "Personal Fundraising Pages", text: "Every member gets a shareable page that rolls up into the campaign." },
  { icon: Smartphone, title: "M-Pesa Contributions", text: "Supporters pay via STK Push to your own PayBill or Till — no cash handling." },
  { icon: CalendarClock, title: "Pledge Tracking", text: "Record promises with due dates and reminders, kept separate from real money." },
  { icon: Building2, title: "Organisation Management", text: "Members, staff, roles and settings in one tidy place." },
  { icon: BarChart3, title: "Fundraising Analytics", text: "See verified totals, trends and top fundraisers at a glance." },
];

function Home() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [heroLoaded, setHeroLoaded] = useState(false);
  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError("");
    try {
      setPlans(await api.subscriptions.plans());
    } catch (cause) {
      setPlansError(cause instanceof Error ? cause.message : "Unable to load subscription plans.");
    } finally {
      setPlansLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);
  const displayedPlanCount = plansLoading ? 2 : plans.length;
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <section className="bg-hero">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-primary"><ShieldCheck className="h-3.5 w-3.5" />Built for Kenya · M-Pesa ready</span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">Fundraising made simple.</h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">Helping churches, schools, NGOs and community groups raise funds together — with campaigns, personal pages, M-Pesa and pledges in one place.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 rounded-xl px-6"><Link to="/register" search={{ campaignCode: undefined, invite: undefined }}>Register your organisation</Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6"><Link to="/fundraiser/$slug" params={{ slug: "wanjiku-building-fund" }}>See a fundraising page</Link></Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["Verified totals only", "Your own PayBill/Till", "From KSh 1,000/month"].map((t) => <span key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" />{t}</span>)}
            </div>
          </div>
          <div className="relative">
            {!heroLoaded && <Skeleton className="absolute inset-0 aspect-[5/4] rounded-3xl" />}
            <img src={hero} width={1280} height={1024} alt="Church volunteers in Nairobi in front of their new building" onLoad={() => setHeroLoaded(true)} onError={() => setHeroLoaded(true)} className={`aspect-[5/4] w-full rounded-3xl object-cover shadow-elevated transition-opacity duration-300 ${heroLoaded ? "opacity-100" : "opacity-0"}`} />
            <div className="absolute -bottom-6 left-4 right-4 rounded-2xl border bg-card p-4 shadow-card sm:left-auto sm:right-6 sm:w-72">
              <p className="text-xs text-muted-foreground">Church Building Fund</p>
              <p className="mt-1 text-xl font-bold">KSh 2.26M <span className="text-sm font-normal text-muted-foreground">of 5M</span></p>
              <ProgressBar value={45} className="mt-3" />
              <p className="mt-2 text-xs text-muted-foreground">92 members fundraising</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Everything your organisation needs to raise more.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-card">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary"><f.icon className="h-5 w-5" /></div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="bg-ink py-20 text-ink-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">How it works</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-4">
            {["Register your organisation and connect M-Pesa.", "Create a campaign and share the join link with members.", "Members publish personal fundraising pages.", "Supporters give via M-Pesa or pledge — you see verified totals live."].map((t, i) => (
              <div key={i}><span className="font-display text-4xl text-primary-soft">0{i + 1}</span><p className="mt-3 text-sm opacity-80">{t}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">Trust and transparency, built in.</h2>
          <p className="mt-4 text-muted-foreground">FundR only counts M-Pesa contributions once they are verified. Pledges are tracked separately and never inflate your totals. Money goes straight to your organisation's own PayBill or Till — FundR never holds funds, and we never ask for an M-Pesa PIN.</p>
        </div>
        <ul className="space-y-3">
          {["Verified contributions only in raised totals", "Pledges shown separately with due dates", "Payments go to your own M-Pesa account", "Full audit trail of every important action"].map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm"><HandCoins className="h-4 w-4 shrink-0 text-primary" />{t}</li>
          ))}
        </ul>
      </section>

      <section id="pricing" className="border-t bg-card py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Clear, campaign-based pricing
            </span>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">A plan for every campaign</h2>
            <p className="mt-3 text-muted-foreground">
            Choose capacity that fits your campaign. Plans and prices are set by the platform.
            </p>
          </div>
          <div
            className={`mx-auto mt-10 grid w-full gap-5 ${
            displayedPlanCount > 2
              ? "max-w-6xl sm:grid-cols-2 lg:grid-cols-3"
              : displayedPlanCount === 1
                ? "max-w-xl grid-cols-1"
                : "max-w-4xl sm:grid-cols-2"
            }`}
            role={plansLoading ? "status" : undefined}
            aria-label={plansLoading ? "Loading subscription plans" : undefined}
            aria-busy={plansLoading || undefined}
          >
            {plansLoading ? Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="rounded-3xl border bg-background p-6 shadow-card" aria-hidden="true">
              <Skeleton className="h-10 w-10 rounded-xl" /><Skeleton className="mt-5 h-4 w-2/3" /><Skeleton className="mt-4 h-9 w-3/4" /><Skeleton className="mt-4 h-4 w-1/2" />
            </div>
            )) : plansError ? <div className="sm:col-span-2 lg:col-span-5"><ErrorState message={plansError} onRetry={() => void loadPlans()} /></div>
            : plans.length === 0 ? <div className="sm:col-span-2 lg:col-span-5"><EmptyState title="No plans available yet" description="Subscription plans will appear here when they are published." /></div>
            : plans.map((p) => (
              <article
                key={p.id}
                className="group relative flex min-h-full flex-col overflow-hidden rounded-3xl border bg-background shadow-card transition duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated"
                aria-labelledby={`plan-${p.id}`}
              >
                <div className="h-1.5 bg-gradient-to-r from-primary/50 via-primary to-primary/30" />
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                      <Users className="size-5" aria-hidden="true" />
                    </div>
                    <span className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                      Per campaign
                    </span>
                  </div>
                  <h3 id={`plan-${p.id}`} className="mt-5 text-xl font-bold tracking-tight">
                    {p.name}
                  </h3>
                  <div className="mt-4 flex min-h-11 items-baseline gap-1.5">
                    <span className="text-3xl font-bold tracking-tight sm:text-4xl">
                      {p.price === null || p.price === 0 ? "Free" : formatKES(p.price)}
                    </span>
                    {p.price !== null && p.price > 0 && (
                      <span className="text-sm text-muted-foreground">/ month</span>
                    )}
                  </div>
                  <div className="mt-5 rounded-2xl bg-muted/60 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Campaign capacity
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {p.maxMembers === null
                        ? `${p.minMembers.toLocaleString()}+ members`
                        : p.minMembers <= 1
                          ? `Up to ${p.maxMembers.toLocaleString()} members`
                          : `${p.minMembers.toLocaleString()}–${p.maxMembers.toLocaleString()} members`}
                    </p>
                  </div>
                  <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      Applies to one campaign
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      Upgrade as your campaign grows
                    </li>
                  </ul>
                  <Button
                    asChild
                    variant="outline"
                    className="mt-7 h-11 w-full justify-between rounded-xl group-hover:border-primary/40 group-hover:text-primary"
                  >
                    <Link to="/register" search={{ campaignCode: undefined, invite: undefined }}>
                      Get started
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!plansLoading && !plansError && plans.length > 0 && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
            Each campaign has its own plan and member capacity.
            </p>
          )}
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
