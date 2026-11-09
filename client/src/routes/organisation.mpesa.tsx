import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Banknote,
  CheckCircle2,
  CircleCheck,
  Loader2,
  ShieldAlert,
  Smartphone,
  XCircle,
} from "lucide-react";
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
  head: () =>
    meta(
      "M-Pesa settings",
      "Connect your organisation's PayBill or Till number for contributions.",
    ),
  component: Mpesa,
});

function Mpesa() {
  const { mpesa, setMpesa } = useDemo();
  const [f, setF] = useState({
    type: mpesa.type,
    shortcode: mpesa.shortcode,
    accountName: mpesa.accountName,
    environment: mpesa.environment,
    key: "",
    secret: "",
    passkey: "",
  });
  const [er, setEr] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disc, setDisc] = useState(false);
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
    e.preventDefault();
    const x: Record<string, string> = {};
    const shortcode = normalizeShortcode(f.shortcode);
    if (!isValidShortcode(shortcode)) x.shortcode = "Shortcode should contain 5–7 digits.";
    if (f.accountName.trim().length < 2) x.accountName = "Account name is required.";
    if (!f.key) x.key = "Consumer key is required.";
    if (!f.secret) x.secret = "Consumer secret is required.";
    if (f.type === "PAYBILL" && !f.passkey) x.passkey = "Passkey is required for PayBill.";
    setEr(x);
    if (Object.keys(x).length) return;
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
        description:
          error instanceof Error
            ? error.message
            : "Daraja could not verify the supplied credentials.",
        icon: <XCircle className="h-5 w-5" />,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="M-Pesa settings"
        description="Connect the payment account your supporters will use to contribute."
      />
      <Panel
        className={cn(
          "relative mb-5 isolate overflow-hidden border-0 p-5 text-white shadow-elevated sm:p-6",
          mpesa.connected
            ? "bg-gradient-to-r from-emerald-950 via-emerald-800 to-primary"
            : "bg-gradient-to-r from-rose-950 via-rose-900 to-orange-800",
        )}
      >
        <div className="absolute -right-10 -top-20 -z-10 size-64 rounded-full border border-white/10" />
        <div className="absolute -right-1 -top-12 -z-10 size-44 rounded-full border border-white/10" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            {mpesa.connected ? (
              <CircleCheck className="size-7" />
            ) : (
              <Smartphone className="size-7" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
              Payment connection
            </p>
            <p className="mt-1 text-xl font-semibold">
              {mpesa.connected ? "M-Pesa is connected" : "Connect your M-Pesa account"}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {mpesa.connected
                ? `${mpesa.type === "PAYBILL" ? "PayBill" : "Till"} ${mpesa.shortcode} · ${mpesa.environment.toLowerCase()} · verified ${formatDate(mpesa.lastVerified)}`
                : "Supporters can pay directly to your organisation once configured."}
            </p>
          </div>
          {mpesa.connected && (
            <Button
              variant="outline"
              disabled={testing || saving}
              onClick={async () => {
                setTesting(true);
                const loadingToast = toast.loading("Testing Daraja credentials…");
                try {
                  const result = await api.mpesa.test({
                    key: f.key,
                    secret: f.secret,
                    environment: f.environment,
                  });
                  toast.dismiss(loadingToast);
                  toast.success("Daraja connection verified", {
                    description: result.message,
                    icon: <CheckCircle2 className="h-5 w-5 text-success" />,
                  });
                } catch (error) {
                  toast.dismiss(loadingToast);
                  toast.error("Daraja connection failed", {
                    description:
                      error instanceof Error
                        ? error.message
                        : "The credentials could not be verified.",
                    icon: <XCircle className="h-5 w-5" />,
                  });
                } finally {
                  setTesting(false);
                }
              }}
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {testing && <Loader2 className="h-4 w-4 animate-spin" />}Test connection
            </Button>
          )}
        </div>
      </Panel>
      <form onSubmit={save} noValidate>
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-3 border-b bg-muted/20 px-5 py-4 sm:px-6">
            <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
              <Banknote className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Account details</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Choose your collection method and enter the Safaricom details.
              </span>
            </span>
          </div>
          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <p className="mb-2 text-sm font-medium">Collection method</p>
              <div className="grid grid-cols-2 gap-3">
                {(["PAYBILL", "TILL"] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setF({ ...f, type: t })}
                    className={cn(
                      "group flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/40 sm:p-4",
                      f.type === t
                        ? "border-primary bg-primary-soft/70 ring-1 ring-primary/20"
                        : "bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-xl",
                        f.type === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Smartphone className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">
                        {t === "PAYBILL" ? "PayBill" : "Till"}
                      </span>
                      <span className="mt-0.5 block text-[0.68rem] text-muted-foreground">
                        {t === "PAYBILL" ? "Business payment" : "Buy Goods"}
                      </span>
                    </span>
                    {f.type === t && <CheckCircle2 className="ml-auto size-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business shortcode" htmlFor="sc" error={er.shortcode}>
                <input
                  id="sc"
                  inputMode="numeric"
                  maxLength={7}
                  placeholder="e.g. 123456"
                  className={inputCls}
                  value={f.shortcode}
                  onChange={(e) => setF({ ...f, shortcode: normalizeShortcode(e.target.value) })}
                />
              </Field>
              <Field label="Account name" htmlFor="an" error={er.accountName}>
                <input
                  id="an"
                  className={inputCls}
                  value={f.accountName}
                  onChange={(e) => setF({ ...f, accountName: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Environment" htmlFor="env">
              <select
                id="env"
                className={inputCls}
                value={f.environment}
                onChange={(e) =>
                  setF({ ...f, environment: e.target.value as "SANDBOX" | "PRODUCTION" })
                }
              >
                <option value="SANDBOX">Sandbox (testing)</option>
                <option value="PRODUCTION">Production (live)</option>
              </select>
            </Field>
            <div className="border-t pt-5">
              <div className="mb-4">
                <p className="text-sm font-semibold">Daraja API credentials</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the credentials from your Safaricom Daraja application.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Consumer key" htmlFor="ck" error={er.key}>
                  <input
                    id="ck"
                    type="password"
                    autoComplete="off"
                    className={inputCls}
                    value={f.key}
                    onChange={(e) => setF({ ...f, key: e.target.value })}
                    placeholder={mpesa.connected ? "•••••••• (saved)" : ""}
                  />
                </Field>
                <Field label="Consumer secret" htmlFor="cs" error={er.secret}>
                  <input
                    id="cs"
                    type="password"
                    autoComplete="off"
                    className={inputCls}
                    value={f.secret}
                    onChange={(e) => setF({ ...f, secret: e.target.value })}
                    placeholder={mpesa.connected ? "•••••••• (saved)" : ""}
                  />
                </Field>
              </div>
              {f.type === "PAYBILL" && (
                <Field label="Passkey" htmlFor="pk" error={er.passkey}>
                  <input
                    id="pk"
                    type="password"
                    autoComplete="off"
                    className={inputCls}
                    value={f.passkey}
                    onChange={(e) => setF({ ...f, passkey: e.target.value })}
                  />
                </Field>
              )}
            </div>
            <p className="flex gap-2 rounded-xl border border-success/15 bg-success-soft/60 p-3.5 text-xs leading-relaxed text-success">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Your credentials are sent securely to the server and are never displayed again in the
              browser.
            </p>
            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
              {mpesa.connected ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDisc(true)}
                >
                  Disconnect account
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={saving || testing} className="sm:min-w-52">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? (
                  "Verifying…"
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    Save & verify account
                  </>
                )}
              </Button>
            </div>
          </div>
        </Panel>
      </form>
      <ConfirmDialog
        open={disc}
        onOpenChange={setDisc}
        destructive
        title="Disconnect M-Pesa?"
        description="Supporters will not be able to contribute until you reconnect."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          try {
            const updated = await api.mpesa.disconnect();
            setMpesa(updated);
            setDisc(false);
            toast.success("M-Pesa disconnected");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to disconnect M-Pesa.");
          }
        }}
      />
    </div>
  );
}
