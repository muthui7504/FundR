import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls, PageHeader, Panel } from "@/components/kit";
import { api } from "@/services/api";
import { meta } from "@/utils/meta";
import { isStrongPassword, passwordChecks, passwordError, passwordRequirements } from "@/utils/password";
import { showSuccess } from "@/utils/notifications";

export const Route = createFileRoute("/platform-admin/accounts")({
  head: () => meta("Create accounts", "Create platform administrator and organisation accounts."),
  component: Accounts,
});

function Accounts() {
  const [accountType, setAccountType] = useState<"PLATFORM_ADMIN" | "ORGANISATION_ADMIN">("ORGANISATION_ADMIN");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", organisationName: "", organisationType: "Community organisation",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isStrongPassword(form.password)) {
      setError(passwordError(form.password));
      return;
    }
    setBusy(true);
    try {
      const result = await api.platform.createAccount({ ...form, accountType });
      showSuccess(
        accountType === "PLATFORM_ADMIN" ? "Platform administrator created" : "Organisation account created",
        result.organisation
          ? `${result.organisation.name} and its administrator account were created successfully.`
          : "The new administrator can now sign in.",
      );
      setForm({ name: "", email: "", phone: "", password: "", organisationName: "", organisationType: "Community organisation" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Create accounts" description="Create trusted platform and organisation accounts without using public registration." />
      <Panel className="max-w-3xl p-5 sm:p-6">
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border bg-card p-1">
          <button type="button" onClick={() => setAccountType("ORGANISATION_ADMIN")} className={`rounded-lg py-2 text-sm font-medium ${accountType === "ORGANISATION_ADMIN" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Organisation account</button>
          <button type="button" onClick={() => setAccountType("PLATFORM_ADMIN")} className={`rounded-lg py-2 text-sm font-medium ${accountType === "PLATFORM_ADMIN" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Platform administrator</button>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input className={inputCls} value={form.name} onChange={set("name")} required /></Field>
            <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={set("email")} required /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={set("phone")} /></Field>
            <Field label="Temporary password" hint="Use a strong password that meets every requirement."><input type="password" className={inputCls} value={form.password} onChange={set("password")} minLength={8} required /><PasswordRequirements password={form.password} /></Field>
          </div>
          {accountType === "ORGANISATION_ADMIN" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organisation name"><input className={inputCls} value={form.organisationName} onChange={set("organisationName")} required /></Field>
              <Field label="Organisation type"><select className={inputCls} value={form.organisationType} onChange={set("organisationType")}><option>Community organisation</option><option>Church</option><option>NGO</option><option>School</option><option>Charity</option><option>Welfare group</option></select></Field>
            </div>
          )}
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" disabled={busy || !isStrongPassword(form.password)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Creating account..." : "Create account"}</Button>
        </form>
      </Panel>
    </>
  );
}

function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const values = [checks.length, checks.uppercase, checks.lowercase, checks.number, checks.special, checks.noSequentialNumbers];
  return <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{passwordRequirements.map((requirement, index) => <li key={requirement} className={values[index] ? "text-success" : ""}>{values[index] ? "✓" : "○"} {requirement}</li>)}</ul>;
}
