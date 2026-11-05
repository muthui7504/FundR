import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/kit";
import { formatKES, normaliseKenyanPhone } from "@/utils/format";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

export type PayState = "ready" | "confirm" | "initiating" | "awaiting" | "pending" | "verified" | "failed" | "cancelled" | "timeout" | "unknown";

/** id of the form — the sticky bottom bar submits it with <button type="submit" form={CONTRIBUTE_FORM_ID}>. */
export const CONTRIBUTE_FORM_ID = "contribute-form";

const SUGGESTED = [100, 250, 500, 1000, 2500];
const PAYMENT_REQUEST_TIMEOUT_MS = 120_000;

/** A contribution is successful only after the backend confirms the M-Pesa callback. */
export function ContributeForm({ profileId, disabled, onDone, onState, onValue, onValidityChange }: {
  profileId: string;
  disabled?: boolean;
  onDone?: () => void;
  onState?: (s: PayState) => void;
  onValue?: (v: number) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [amount, setAmount] = useState(500); const [custom, setCustom] = useState("");
  const [er, setEr] = useState<Record<string, string>>({}); const [state, setState] = useState<PayState>("ready");
  const [paymentError, setPaymentError] = useState("");
  const [statusCheckMessage, setStatusCheckMessage] = useState("");
  const value = custom ? Number(custom) : amount;
  const phoneRef = useRef<HTMLInputElement>(null); const amountRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<number | null>(null);
  const paymentTimeoutRef = useRef<number | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => { onState?.(state); }, [state, onState]);
  useEffect(() => () => {
    pollingRef.current = false;
    if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    if (paymentTimeoutRef.current !== null) window.clearTimeout(paymentTimeoutRef.current);
  }, []);
  useEffect(() => { onValue?.(Number.isFinite(value) ? value : 0); }, [value, onValue]);
  useEffect(() => {
    onValidityChange?.(normaliseKenyanPhone(phone) !== null && value >= 10 && value <= 150000);
  }, [phone, value, onValidityChange]);

  const validate = () => {
    const x: Record<string, string> = {};
    if (!normaliseKenyanPhone(phone)) x.phone = "Enter a valid Safaricom number, e.g. 0712 345 678.";
    if (!(value >= 10)) x.amount = "Minimum contribution is KSh 10.";
    if (value > 150000) x.amount = "M-Pesa limit is KSh 150,000 per transaction.";
    return x;
  };
  const review = (e: React.FormEvent) => {
    e.preventDefault(); const x = validate();
    setEr(x);
    if (Object.keys(x).length) { if (x.phone) phoneRef.current?.focus(); else amountRef.current?.focus(); return; }
    setState("confirm");
  };
  const reset = () => {
    pollingRef.current = false;
    if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    if (paymentTimeoutRef.current !== null) window.clearTimeout(paymentTimeoutRef.current);
    setPaymentError("");
    setStatusCheckMessage("");
    setState("ready");
    onDone?.();
  };
  const startPayment = async () => {
    setPaymentError("");
    setStatusCheckMessage("");
    pollingRef.current = true;
    setState("initiating");
    try {
      const started = await api.contributions.initiateStk({
        profileId,
        phone: normaliseKenyanPhone(phone) ?? phone,
        amount: value,
        supporterName: name || undefined,
      });
      setState("awaiting");
      const startedAt = Date.now();
      paymentTimeoutRef.current = window.setTimeout(() => {
        pollingRef.current = false;
        if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
        setState("timeout");
      }, PAYMENT_REQUEST_TIMEOUT_MS);
      const poll = async (): Promise<void> => {
        if (!pollingRef.current) return;
        if (Date.now() - startedAt >= PAYMENT_REQUEST_TIMEOUT_MS) {
          pollingRef.current = false;
          if (paymentTimeoutRef.current !== null) window.clearTimeout(paymentTimeoutRef.current);
          setState("timeout");
          return;
        }
        const statusController = new AbortController();
        const statusTimeout = window.setTimeout(() => statusController.abort(), 12_000);
        try {
          const result = await api.contributions.status(started.contributionId, statusController.signal);
          if (!pollingRef.current) return;
          setStatusCheckMessage("");
          if (result.status === "COMPLETED") {
            pollingRef.current = false;
            if (paymentTimeoutRef.current !== null) window.clearTimeout(paymentTimeoutRef.current);
            setState("verified");
            return;
          }
          if (["FAILED", "REVERSED", "REFUNDED"].includes(result.status)) {
            pollingRef.current = false;
            if (paymentTimeoutRef.current !== null) window.clearTimeout(paymentTimeoutRef.current);
            if (result.resultCode === 1037) {
              setState("timeout");
              return;
            }
            if (result.resultCode === 1032) {
              setState("cancelled");
              return;
            }
            setPaymentError(result.failureReason || "M-Pesa did not authorize this payment.");
            setState("failed");
            return;
          }
          setState("pending");
        } catch {
          if (!pollingRef.current) return;
          setState("pending");
          setStatusCheckMessage("We couldn't check the status just now. We'll keep checking automatically.");
        } finally {
          window.clearTimeout(statusTimeout);
        }
        pollTimerRef.current = window.setTimeout(() => void poll(), 2_000);
      };
      pollTimerRef.current = window.setTimeout(() => void poll(), 2_000);
    } catch (cause) {
      pollingRef.current = false;
      setPaymentError(cause instanceof Error ? cause.message : "Unable to start the M-Pesa payment.");
      setState("failed");
    }
  };

  if (state !== "ready") {
    const S: Record<Exclude<PayState, "ready" | "confirm">, { icon: React.ReactNode; title: string; text: string }> = {
      initiating: { icon: <Loader2 className="h-8 w-8 animate-spin text-primary" />, title: "Initiating payment…", text: "Sending a payment request to M-Pesa." },
      awaiting: { icon: <Smartphone className="h-8 w-8 animate-pulse text-primary" />, title: "Check your phone", text: `An M-Pesa prompt was sent to ${phone}. Enter your PIN on your phone to approve ${formatKES(value)}. Never share your PIN with anyone — we will never ask for it.` },
      pending: { icon: <Loader2 className="h-8 w-8 animate-spin text-primary" />, title: "Pending verification", text: statusCheckMessage || "We're waiting for M-Pesa to confirm this payment. We'll keep checking until the payment is verified." },
      verified: { icon: <CheckCircle2 className="h-8 w-8 text-success" />, title: "Payment successful", text: "Your contribution has been confirmed by M-Pesa. Tap Done to return to the fundraiser." },
      failed: { icon: <XCircle className="h-8 w-8 text-destructive" />, title: "Payment failed", text: paymentError || "M-Pesa could not complete this payment. No money was taken." },
      cancelled: { icon: <XCircle className="h-8 w-8 text-muted-foreground" />, title: "Payment cancelled", text: "The request was cancelled on your phone." },
      timeout: { icon: <AlertCircle className="h-8 w-8 text-warning" />, title: "Request timed out", text: "We didn't receive a response in time. Please try again." },
      unknown: { icon: <AlertCircle className="h-8 w-8 text-muted-foreground" />, title: "Result unknown", text: "We couldn't confirm the outcome. Check your M-Pesa messages before trying again." },
    };
    if (state === "confirm") return (
      <div className="space-y-4">
        <p className="font-semibold">Confirm your contribution</p>
        <dl className="space-y-2 rounded-xl bg-muted p-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{formatKES(value)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd>{phone}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Shown as</dt><dd>{name || "Anonymous"}</dd></div>
        </dl>
        <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setState("ready")}>Back</Button><Button onClick={() => void startPayment()}>Pay with M-Pesa</Button></div>
      </div>
    );
    const s = S[state];
    return (
      <div className="space-y-4 text-center" aria-live="polite">
        <div className="flex justify-center">{s.icon}</div>
        <p className="font-semibold">{s.title}</p>
        <p className="text-sm text-muted-foreground">{s.text}</p>
        {!["initiating", "awaiting", "pending"].includes(state) && <Button className="w-full" onClick={reset}>{["failed", "timeout", "cancelled", "unknown"].includes(state) ? "Try again" : "Done"}</Button>}
      </div>
    );
  }

  return (
    <form id={CONTRIBUTE_FORM_ID} onSubmit={review} className="space-y-4" noValidate>
      <div>
        <p className="mb-2 text-sm font-medium">Amount</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {SUGGESTED.map((a) => <button type="button" key={a} onClick={() => { setAmount(a); setCustom(""); }} className={cn("h-11 rounded-xl border text-sm font-semibold", !custom && amount === a ? "border-primary bg-primary-soft text-primary" : "bg-card")}>{a.toLocaleString()}</button>)}
        </div>
      </div>
      <Field label="Or enter a custom amount (KSh)" htmlFor="amt" error={er.amount}><input ref={amountRef} id="amt" type="number" inputMode="numeric" min={10} className={inputCls} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 750" /></Field>
      <Field label="M-Pesa phone number" htmlFor="ph" error={er.phone}><input ref={phoneRef} id="ph" inputMode="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" aria-invalid={!!er.phone} /></Field>
      <Field label="Your name (optional)" htmlFor="nm" hint="Leave blank to give anonymously."><input id="nm" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <p className="text-center text-xs text-muted-foreground">You'll get an M-Pesa prompt on your phone. Fundraise never asks for your PIN.</p>
    </form>
  );
}
