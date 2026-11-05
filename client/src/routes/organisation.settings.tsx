import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, PageHeader, Panel, inputCls, textareaCls } from "@/components/kit";
import { useDemo } from "@/context/DemoStore";
import { meta } from "@/utils/meta";
import type { Organisation } from "@/types";
import { api } from "@/services/api";
import { requireAuth } from "@/lib/auth";

export const Route = createFileRoute("/organisation/settings")({
  beforeLoad: () => requireAuth(["ORGANISATION_ADMIN"]),
  head: () => meta("Organisation settings", "Update your organisation's profile and contact details."),
  component: Settings,
});

function Settings() {
  const { org, setOrg } = useDemo();
  const [f, setF] = useState<Organisation>(org);
  const [er, setEr] = useState<Record<string, string>>({});
  const s = (k: keyof Organisation) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); const x: Record<string, string> = {};
    if (f.name.trim().length < 2) x.name = "Name is required.";
    if (!/^[a-z0-9-]+$/.test(f.slug)) x.slug = "Lowercase letters, numbers and hyphens only.";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) x.email = "Enter a valid email.";
    setEr(x); if (Object.keys(x).length) return;
    try {
      const updated = await api.organisations.update(f);
      setOrg(updated);
      setF(updated);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save settings.");
    }
  };
  const input = (k: keyof Organisation, label: string, type = "text") => (
    <Field label={label} htmlFor={k} error={er[k]}><input id={k} type={type} className={inputCls} value={f[k] as string} onChange={s(k)} aria-invalid={!!er[k]} /></Field>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Organisation settings" description="This information appears on your public fundraising pages." />
      <form onSubmit={save} noValidate>
        <Panel className="space-y-5 p-5 sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary"><Upload className="h-6 w-6" /></div>
            <div className="min-w-0"><p className="text-sm font-medium">Logo</p><input type="file" accept="image/*" aria-label="Upload logo" className="mt-1 block w-full min-w-0 max-w-full text-xs" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">{input("name", "Organisation name")}{input("slug", "Slug")}</div>
          <Field label="Organisation type" htmlFor="type"><select id="type" className={inputCls} value={f.type} onChange={s("type")}>{["Church", "NGO", "School", "Charity", "Welfare group", "Community organisation"].map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Description" htmlFor="desc"><textarea id="desc" className={textareaCls} value={f.description} onChange={s("description")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">{input("email", "Contact email", "email")}{input("phone", "Contact phone")}</div>
          {input("website", "Website", "url")}
          <div className="grid gap-4 sm:grid-cols-3">{input("country", "Country")}{input("city", "City")}{input("address", "Address")}</div>
          <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="ghost" onClick={() => setF(org)}>Reset</Button><Button type="submit">Save settings</Button></div>
        </Panel>
      </form>
    </div>
  );
}
