import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, ErrorState, Field, inputCls, PageHeader, Panel } from "@/components/kit";
import { SkeletonTable } from "@/components/loading-skeletons";
import { api } from "@/services/api";
import type { Plan } from "@/types";
import { formatKES } from "@/utils/format";
import { meta } from "@/utils/meta";
import { showSuccess } from "@/utils/notifications";

export const Route = createFileRoute("/platform-admin/plans")({
  head: () => meta("Subscription plans", "Create and manage FundR subscription plans."),
  component: Plans,
});

function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({ name: "", minMembers: "1", maxMembers: "", price: "" });
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setPlans(await api.platform.plans());
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Unable to load plans.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const plan = await api.platform.createPlan({
        name: form.name,
        minMembers: Number(form.minMembers),
        maxMembers: form.maxMembers === "" ? null : Number(form.maxMembers),
        price: form.price === "" ? null : Number(form.price),
      });
      setPlans((current) => [...current, plan]);
      setForm({ name: "", minMembers: "1", maxMembers: "", price: "" });
      showSuccess("Subscription plan created", `${plan.name} is now available for organisations.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create plan.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (plan: Plan) => {
    try {
      await api.platform.deletePlan(plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      showSuccess("Subscription plan deleted", `${plan.name} was removed from the available plans.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete plan.");
    }
  };

  return (
    <>
      <PageHeader title="Subscription plans" description="View, create and remove the plans available to organisations." />
      <Panel className="max-w-3xl p-5 sm:p-6">
        <h2 className="font-semibold">Create a plan</h2>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Plan name"><input className={inputCls} value={form.name} onChange={set("name")} placeholder="Community" required /></Field>
          <Field label="Price (KSh)" hint="Leave blank for a free plan."><input type="number" min="0" className={inputCls} value={form.price} onChange={set("price")} /></Field>
          <Field label="Minimum members"><input type="number" min="1" step="1" className={inputCls} value={form.minMembers} onChange={set("minMembers")} required /></Field>
          <Field label="Maximum members" hint="Leave blank for unlimited."><input type="number" min="1" step="1" className={inputCls} value={form.maxMembers} onChange={set("maxMembers")} /></Field>
          {error && <p className="text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Creating plan..." : "Create plan"}</Button></div>
        </form>
      </Panel>
      <Panel className="mt-6 overflow-x-auto">
        <div className="border-b p-5"><h2 className="font-semibold">Available plans</h2></div>
        {loading ? <SkeletonTable rows={4} columns={4} /> : loadError ? <ErrorState message={loadError} onRetry={() => void load()} /> : plans.length === 0 ? <EmptyState title="No subscription plans" description="Create the first plan above." /> : (
          <table className="w-full min-w-[650px] text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-4">Plan</th><th className="p-4">Members</th><th className="p-4">Price</th><th className="p-4" /></tr></thead>
            <tbody className="divide-y">
              {plans.map((plan) => <tr key={plan.id}><td className="p-4 font-semibold">{plan.name}</td><td className="p-4">{plan.minMembers}–{plan.maxMembers ?? "∞"}</td><td className="p-4">{plan.price === null || plan.price === 0 ? "Free" : `${formatKES(plan.price)} / billing period`}</td><td className="p-4 text-right"><Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setPlanToDelete(plan)}>Delete</Button></td></tr>)}
            </tbody>
          </table>
        )}
      </Panel>
      <ConfirmDialog
        open={Boolean(planToDelete)}
        onOpenChange={(open) => !open && setPlanToDelete(null)}
        destructive
        title={`Delete ${planToDelete?.name ?? "this plan"}?`}
        description="Organisations will no longer be able to select this plan. This action cannot be undone."
        confirmLabel="Delete plan"
        onConfirm={() => {
          if (!planToDelete) return;
          void remove(planToDelete);
          setPlanToDelete(null);
        }}
      />
    </>
  );
}
