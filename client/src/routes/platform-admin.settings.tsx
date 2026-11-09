import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Panel } from "@/components/kit";
import { meta } from "@/utils/meta";
import { showSuccess } from "@/utils/notifications";

export const Route = createFileRoute("/platform-admin/settings")({
  head: () => meta("Platform settings", "Billing rules, trial length and sign-up controls for FundR."),
  component: Settings,
});

function Settings() {
  const [s, setS] = useState({ supportEmail: "support@fundraise.co.ke", trialDays: "14", graceDays: "14", openSignup: true, requireReview: false, maintenance: false });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PageHeader title="Platform settings" description="Rules that apply to every organisation." />
      <form className="grid max-w-3xl gap-6" onSubmit={(e) => { e.preventDefault(); showSuccess("Platform settings saved", "Your platform configuration was updated successfully."); }}>
        <Panel className="grid gap-4 p-5 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">General & billing</h2>
          <div className="grid gap-1.5 sm:col-span-3"><Label htmlFor="email">Support email</Label><Input id="email" type="email" value={s.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="trial">Free trial (days)</Label><Input id="trial" type="number" min={0} value={s.trialDays} onChange={(e) => set("trialDays", e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="grace">Grace period (days)</Label><Input id="grace" type="number" min={0} value={s.graceDays} onChange={(e) => set("graceDays", e.target.value)} /></div>
        </Panel>
        <Panel className="divide-y p-0">
          {([
            ["openSignup", "Allow new organisations to register", "Turn off to pause public sign-ups."],
            ["requireReview", "Review new organisations before activation", "New sign-ups wait for platform approval."],
            ["maintenance", "Maintenance mode", "Shows a notice and pauses new contributions."],
          ] as const).map(([k, title, desc]) => (
            <div key={k} className="flex items-center justify-between gap-4 p-5">
              <div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{desc}</p></div>
              <Switch checked={s[k]} onCheckedChange={(v) => set(k, v)} aria-label={title} />
            </div>
          ))}
        </Panel>
        <div><Button type="submit">Save settings</Button></div>
      </form>
    </>
  );
}
