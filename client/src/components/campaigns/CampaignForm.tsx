import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, textareaCls } from "@/components/kit";
import type { Campaign } from "@/types";

export type CampaignInput = Pick<Campaign, "name" | "shortDescription" | "description" | "target" | "startDate" | "endDate">;

export function validateCampaign(v: CampaignInput) {
  const e: Record<string, string> = {};
  if (v.name.trim().length < 3) e.name = "Name must be at least 3 characters.";
  if (v.shortDescription.trim().length < 10) e.shortDescription = "Add a short description (10+ characters).";
  if (!(v.target > 0)) e.target = "Target must be greater than KSh 0.";
  if (!v.startDate) e.startDate = "Choose a start date.";
  if (!v.endDate) e.endDate = "Choose an end date.";
  else if (v.startDate && v.endDate <= v.startDate) e.endDate = "End date must be after the start date.";
  return e;
}

export function CampaignForm({ initial, submitLabel, onSubmit, onCancel }: { initial?: Partial<CampaignInput>; submitLabel: string; onSubmit: (v: CampaignInput) => void | Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState<CampaignInput>({ name: "", shortDescription: "", description: "", target: 0, startDate: "", endDate: "", ...initial });
  const [er, setEr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    const e = validateCampaign(v); setEr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await onSubmit(v);
    } finally {
      setBusy(false);
    }
  };
  const s = (k: keyof CampaignInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: k === "target" ? Number(e.target.value) : e.target.value });
  return (
    <form className="space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <Field label="Campaign name" htmlFor="cn" error={er.name}><input id="cn" className={inputCls} value={v.name} onChange={s("name")} aria-invalid={!!er.name} /></Field>
      <Field label="Short description" htmlFor="cs" error={er.shortDescription}><input id="cs" className={inputCls} value={v.shortDescription} onChange={s("shortDescription")} aria-invalid={!!er.shortDescription} /></Field>
      <Field label="Detailed description" htmlFor="cd"><textarea id="cd" className={textareaCls} value={v.description} onChange={s("description")} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Target (KSh)" htmlFor="ct" error={er.target}><input id="ct" type="number" min={1} className={inputCls} value={v.target || ""} onChange={s("target")} aria-invalid={!!er.target} /></Field>
        <Field label="Start date" htmlFor="sd" error={er.startDate}><input id="sd" type="date" className={inputCls} value={v.startDate} onChange={s("startDate")} /></Field>
        <Field label="End date" htmlFor="ed" error={er.endDate}><input id="ed" type="date" className={inputCls} value={v.endDate} onChange={s("endDate")} /></Field>
      </div>
      <Field label="Cover image (optional)" htmlFor="ci" hint="JPG or PNG, up to 5 MB. Upload is stored once connected to the backend."><div className="flex items-center gap-2"><Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><input id="ci" type="file" accept="image/*" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-primary" /></div></Field>
      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
