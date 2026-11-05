import { useMemo, useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, textareaCls } from "@/components/kit";
import { addDays, formatDate, formatKES, normaliseKenyanPhone } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { Pledge } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const dateOnly = (value: string | Date) => {
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromISO = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const clampDate = (value: string, min: string, max: string) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export function PledgeForm({ onCreate, campaignEndDate }: { onCreate: (p: Omit<Pledge, "id" | "profileId" | "campaignId" | "status" | "createdAt">) => void | Promise<void>; campaignEndDate?: string }) {
  const today = dateOnly(new Date());
  const campaignDeadline = campaignEndDate ? dateOnly(campaignEndDate) : null;
  const deadlineLimit = campaignDeadline ? dateOnly(new Date(dateFromISO(campaignDeadline).getTime() - 3 * DAY_MS)) : null;
  const maxDate = deadlineLimit && deadlineLimit > today ? deadlineLimit : today;
  const initialDate = clampDate(addDays(campaignDeadline ? 7 : 30), today, maxDate);
  const [f, setF] = useState({ name: "", phone: "", amount: "", date: initialDate, msg: "", remind: "sms" });
  const [er, setEr] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const daysRemaining = campaignDeadline ? Math.max(0, Math.ceil((dateFromISO(campaignDeadline).getTime() - dateFromISO(today).getTime()) / DAY_MS)) : null;
  const quickOptions = useMemo(() => {
    if (campaignDeadline) {
      const start = dateFromISO(today);
      const end = dateFromISO(campaignDeadline) ;
      const lastAllowed = new Date(end.getTime() - 3 * DAY_MS);
      const finalDate = dateOnly(lastAllowed);
      const totalDays = Math.max(1, Math.ceil((lastAllowed.getTime() - start.getTime()) / DAY_MS));
      return [1, 2, 3].map((quarter) => {
        const days = Math.max(1, Math.round((totalDays * quarter) / 3));
        const value = dateOnly(new Date(start.getTime() + days * DAY_MS));
        return {
          label: `${days} days`,
          value: clampDate(value, today, finalDate),
        };
      });
    }
    return [7, 30, 60].map((days) => ({
      label: `${days} days`,
      value: addDays(days),
    }));
  }, [campaignDeadline, today]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const x: Record<string, string> = {};
    if (f.name.trim().length < 2) x.name = "Enter your name.";
    if (!normaliseKenyanPhone(f.phone)) x.phone = "Enter a valid Kenyan phone number.";
    if (!(Number(f.amount) >= 10)) x.amount = "Minimum pledge is KSh 10.";
    if (!f.date) x.date = "Choose a future date.";
    else if (f.date <= today) x.date = "Choose a future date.";
    else if (campaignDeadline && f.date > campaignDeadline) x.date = "Choose a date on or before the campaign end date.";
    else if (campaignDeadline && f.date > deadlineLimit) x.date = "Choose a date at least 3 days before the campaign ends.";
    setEr(x); if (Object.keys(x).length || busy) return;
    setBusy(true);
    setSubmitError("");
    try {
      await onCreate({ supporterName: f.name, phone: normaliseKenyanPhone(f.phone)!, amount: Number(f.amount), dueDate: f.date, message: f.msg });
      setDone(true);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Unable to record this pledge.");
    } finally {
      setBusy(false);
    }
  };
  if (done) return (
    <div className="space-y-3 text-center">
      <CalendarCheck className="mx-auto h-8 w-8 text-primary" />
      <p className="font-semibold">Pledge recorded</p>
      <p className="text-sm text-muted-foreground">Thank you, {f.name.split(" ")[0]}. You pledged {formatKES(Number(f.amount))} by {formatDate(f.date)}. We'll remind you by {f.remind === "sms" ? "SMS" : f.remind === "whatsapp" ? "WhatsApp" : "— no reminders"}. Pledges aren't counted as raised until paid.</p>
      <Button variant="outline" className="w-full" onClick={() => { setDone(false); setF({ ...f, amount: "", msg: "" }); }}>Make another pledge</Button>
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="pn" error={er.name}><input id="pn" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone number" htmlFor="pp" error={er.phone}><input id="pp" inputMode="tel" placeholder="0712 345 678" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <Field label="Pledge amount (KSh)" htmlFor="pa" error={er.amount}><input id="pa" type="number" min={10} className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      <div>
        <p className="mb-2 text-sm font-medium">I'll pay by</p>
        {daysRemaining !== null && <p className="mb-2 text-xs text-muted-foreground">{daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining before the campaign ends. Choose a date no later than 3 days before the end date.</p>}
        {quickOptions.length > 0 && (
          <div className="mb-2 grid grid-cols-3 gap-2">{quickOptions.map(({ label, value }) => (
            <button type="button" key={label} onClick={() => setF({ ...f, date: value })} className={cn("h-10 rounded-xl border text-sm", f.date === value ? "border-primary bg-primary-soft text-primary" : "bg-card")}>{label}</button>
          ))}</div>
        )}
        <Field label="Or pick a date" htmlFor="pd" error={er.date}><input id="pd" type="date" className={inputCls} min={today} max={campaignDeadline ? deadlineLimit ?? campaignDeadline : undefined} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </div>
      <Field label="Message (optional)" htmlFor="pm"><textarea id="pm" className={textareaCls + " min-h-20"} value={f.msg} onChange={(e) => setF({ ...f, msg: e.target.value })} /></Field>
      <Field label="Reminder preference" htmlFor="pr"><select id="pr" className={inputCls} value={f.remind} onChange={(e) => setF({ ...f, remind: e.target.value })}><option value="sms">SMS reminder</option><option value="whatsapp">WhatsApp reminder</option><option value="none">No reminder</option></select></Field>
      {submitError && <p className="text-sm text-destructive" role="alert">{submitError}</p>}
      <Button type="submit" variant="outline" className="h-12 w-full rounded-xl" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Recording pledge…" : "Make a pledge"}</Button>
    </form>
  );
}
