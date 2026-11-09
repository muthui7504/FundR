import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, MapPin, Upload } from "lucide-react";
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
  head: () =>
    meta("Organisation settings", "Update your organisation's profile and contact details."),
  component: Settings,
});

function Settings() {
  const { org, setOrg } = useDemo();
  const [f, setF] = useState<Organisation>(org);
  const [er, setEr] = useState<Record<string, string>>({});
  const s =
    (k: keyof Organisation) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (f.name.trim().length < 2) x.name = "Name is required.";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) x.email = "Enter a valid email.";
    setEr(x);
    if (Object.keys(x).length) return;
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
    <Field label={label} htmlFor={k} error={er[k]}>
      <input
        id={k}
        type={type}
        className={inputCls}
        value={f[k] as string}
        onChange={s(k)}
        aria-invalid={!!er[k]}
      />
    </Field>
  );
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Organisation settings"
        description="Shape how your organisation appears to supporters across FundR."
      />
      <div className="mb-5 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r from-primary to-emerald-700 p-5 text-primary-foreground shadow-elevated sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <Building2 className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
              Public organisation profile
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">
              {f.name || "Your organisation"}
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {f.city || f.country || "Add your location"}
              {f.type ? ` · ${f.type}` : ""}
            </p>
          </div>
        </div>
      </div>
      <form onSubmit={save} noValidate className="space-y-5">
        <Panel className="overflow-hidden">
          <SectionHeading
            icon={<Building2 className="size-4" />}
            title="Identity"
            description="The name, type, and description supporters see."
          />
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex min-w-0 items-center gap-4 rounded-2xl border bg-muted/25 p-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                <Upload className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Organisation logo</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  A recognisable logo helps supporters identify your organisation.
                </p>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Upload logo"
                  className="mt-2 block w-full min-w-0 max-w-full text-xs"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {input("name", "Organisation name")}
              <Field label="Organisation URL slug" htmlFor="slug">
                <input
                  id="slug"
                  className={`${inputCls} cursor-not-allowed bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100`}
                  value={f.slug}
                  disabled
                />
              </Field>
            </div>
            <Field label="Organisation type" htmlFor="type">
              <select id="type" className={inputCls} value={f.type} onChange={s("type")}>
                {[
                  "Church",
                  "NGO",
                  "School",
                  "Charity",
                  "Welfare group",
                  "Community organisation",
                ].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field
              label="About your organisation"
              htmlFor="desc"
              hint="A short introduction helps supporters understand the work you do."
            >
              <textarea
                id="desc"
                className={textareaCls}
                value={f.description}
                onChange={s("description")}
              />
            </Field>
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <SectionHeading
            icon={<Mail className="size-4" />}
            title="Contact details"
            description="Give supporters a way to reach your team."
          />
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            {input("email", "Contact email", "email")}
            {input("phone", "Contact phone")}
            {input("website", "Website", "url")}
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <SectionHeading
            icon={<MapPin className="size-4" />}
            title="Location"
            description="Help supporters find and recognise your organisation."
          />
          <div className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
            {input("country", "Country")}
            {input("city", "City")}
            {input("address", "Address")}
          </div>
        </Panel>
        <div className="flex flex-col-reverse gap-3 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted-foreground">
            Changes update your public organisation profile.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setF(org);
                setEr({});
              }}
            >
              Discard changes
            </Button>
            <Button type="submit">
              <Building2 className="size-4" />
              Save profile
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b bg-muted/20 px-5 py-4 sm:px-6">
      <span className="grid size-9 place-items-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </div>
  );
}
