import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Field, PageHeader, Panel, inputCls } from "@/components/kit";
import { useDemo } from "@/context/DemoStore";
import { formatDate } from "@/utils/format";
import { meta } from "@/utils/meta";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { isValidShortcode, normalizeShortcode } from "@/utils/mpesa";
import { requireAuth } from "@/lib/auth";

export const Route = createFileRoute("/organisation/mpesa")({
  beforeLoad: () => requireAuth(["ORGANISATION_ADMIN"]),
  head: () => meta("M-Pesa settings", "Connect your organisation's PayBill or Till number for contributions."),
  component: Mpesa,
});

function Mpesa() {
  const { mpesa, setMpesa } = useDemo();
  const [f, setF] = useState({ type: mpesa.type, shortcode: mpesa.shortcode, accountName: mpesa.accountName, environment: mpesa.environment, key: "", secret: "", passkey: "" });
  const [er, setEr] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false); const [saving, setSaving] = useState(false); const [disc, setDisc] = useState(false);
  useEffect(() => {
    setF((current) => ({
      ...current,
      type: mpesa.type,
      shortcode: mpesa.shortcode,
      accountName: mpesa.accountName,
      environment: mpesa.environment,
    }));
  }, [mpesa]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); const x: Record<string, string> = {};
    const shortcode = normalizeShortcode(f.shortcode);
    if (!isValidShortcode(shortcode)) x.shortcode = "Shortcode should contain 5–7 digits.";
    if (f.accountName.trim().length < 2) x.accountName = "Account name is required.";
    if (!f.key) x.key = "Consumer key is required."; if (!f.secret) x.secret = "Consumer secret is required.";
    if (f.type === "PAYBILL" && !f.passkey) x.passkey = "Passkey is required for PayBill.";
    setEr(x); if (Object.keys(x).length) return;
    setSaving(true);
    const loadingToast = toast.loading("Verifying Daraja credentials…", {
      description: "Please wait while Safaricom verifies the supplied credentials.",
    });
    try {
      const updated = await api.mpesa.save(f);
      setMpesa(updated);
      setF({ ...f, key: "", secret: "", passkey: "" });
      toast.dismiss(loadingToast);
      toast.success("M-Pesa configuration saved", {
        description: "Daraja verified the consumer credentials successfully.",
        icon: <CheckCircle2 className="h-5 w-5 text-success" />,
      });
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("M-Pesa configuration was not saved", {
        description: error instanceof Error ? error.message : "Daraja could not verify the supplied credentials.",
        icon: <XCircle className="h-5 w-5" />,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="M-Pesa settings" description="Contributions go directly to your own PayBill or Till." />
      <Panel className={cn("mb-6 flex items-center gap-4 p-5", mpesa.connected ? "" : "border-destructive/30")}>
        {mpesa.connected ? <CheckCircle2 className="h-8 w-8 shrink-0 text-success" /> : <XCircle className="h-8 w-8 shrink-0 text-destructive" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{mpesa.connected ? "Connected" : "Not connected"}</p>
          <p className="text-sm text-muted-foreground">{mpesa.connected ? `${mpesa.type === "PAYBILL" ? "PayBill" : "Till"} ${mpesa.shortcode} · ${mpesa.environment.toLowerCase()} · last verified ${formatDate(mpesa.lastVerified)}` : "Supporters cannot pay until you connect an account."}</p>
        </div>
        {mpesa.connected && <Button variant="outline" disabled={testing || saving} onClick={async () => {
          setTesting(true);
          const loadingToast = toast.loading("Testing Daraja credentials…");
          try {
            const result = await api.mpesa.test({ key: f.key, secret: f.secret, environment: f.environment });
            toast.dismiss(loadingToast);
            toast.success("Daraja connection verified", { description: result.message, icon: <CheckCircle2 className="h-5 w-5 text-success" /> });
          } catch (error) {
            toast.dismiss(loadingToast);
            toast.error("Daraja connection failed", { description: error instanceof Error ? error.message : "The credentials could not be verified.", icon: <XCircle className="h-5 w-5" /> });
          } finally {
            setTesting(false);
          }
        }}>{testing && <Loader2 className="h-4 w-4 animate-spin" />}Test connection</Button>}
      </Panel>
      <form onSubmit={save} noValidate>
        <Panel className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2">
            {(["PAYBILL", "TILL"] as const).map((t) => <button type="button" key={t} onClick={() => setF({ ...f, type: t })} className={cn("rounded-xl border p-3 text-sm font-medium", f.type === t ? "border-primary bg-primary-soft text-primary" : "")}>{t === "PAYBILL" ? "PayBill" : "Till (Buy Goods)"}</button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business shortcode" htmlFor="sc" error={er.shortcode}><input id="sc" inputMode="numeric" maxLength={7} placeholder="e.g. 123456" className={inputCls} value={f.shortcode} onChange={(e) => setF({ ...f, shortcode: normalizeShortcode(e.target.value) })} /></Field>
            <Field label="Account name" htmlFor="an" error={er.accountName}><input id="an" className={inputCls} value={f.accountName} onChange={(e) => setF({ ...f, accountName: e.target.value })} /></Field>
          </div>
          <Field label="Environment" htmlFor="env"><select id="env" className={inputCls} value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value as "SANDBOX" | "PRODUCTION" })}><option value="SANDBOX">Sandbox (testing)</option><option value="PRODUCTION">Production (live)</option></select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Consumer key" htmlFor="ck" error={er.key}><input id="ck" type="password" autoComplete="off" className={inputCls} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder={mpesa.connected ? "•••••••• (saved)" : ""} /></Field>
            <Field label="Consumer secret" htmlFor="cs" error={er.secret}><input id="cs" type="password" autoComplete="off" className={inputCls} value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} placeholder={mpesa.connected ? "•••••••• (saved)" : ""} /></Field>
          </div>
          {f.type === "PAYBILL" && <Field label="Passkey" htmlFor="pk" error={er.passkey}><input id="pk" type="password" autoComplete="off" className={inputCls} value={f.passkey} onChange={(e) => setF({ ...f, passkey: e.target.value })} /></Field>}
          <p className="flex gap-2 rounded-xl bg-warning-soft p-3 text-xs text-warning"><ShieldAlert className="h-4 w-4 shrink-0" />Credentials are sent securely to the server and are never displayed again in the browser.</p>
          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
            {mpesa.connected ? <Button type="button" variant="ghost" className="text-destructive" onClick={() => setDisc(true)}>Disconnect account</Button> : <span />}
            <Button type="submit" disabled={saving || testing}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Verifying…" : "Save configuration"}</Button>
          </div>
        </Panel>
      </form>
      <ConfirmDialog open={disc} onOpenChange={setDisc} destructive title="Disconnect M-Pesa?" description="Supporters will not be able to contribute until you reconnect." confirmLabel="Disconnect"
        onConfirm={async () => {
          try {
            const updated = await api.mpesa.disconnect();
            setMpesa(updated);
            setDisc(false);
            toast.success("M-Pesa disconnected");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to disconnect M-Pesa.");
          }
        }} />
    </div>
  );
}
