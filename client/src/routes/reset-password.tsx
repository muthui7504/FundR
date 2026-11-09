import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, inputCls } from "@/components/kit";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set a new password — FundR" }, { name: "description", content: "Choose a new password for your account." }, { property: "og:title", content: "Set a new password — FundR" }, { property: "og:description", content: "Choose a new FundR password." }] }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [er, setEr] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  if (done) return (
    <AuthLayout title="Password updated" subtitle="You can now log in with your new password.">
      <div className="rounded-2xl border bg-card p-6 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-primary" /><Button asChild className="mt-4"><Link to="/login" search={{ campaignCode: undefined, invite: undefined }}>Go to login</Link></Button></div>
    </AuthLayout>
  );
  return (
    <AuthLayout title="Set a new password" subtitle="Use at least 8 characters.">
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); const x: Record<string, string> = {}; if (pw.length < 8) x.pw = "At least 8 characters."; if (pw !== pw2) x.pw2 = "Passwords do not match."; setEr(x); if (!Object.keys(x).length) setDone(true); }}>
        <Field label="New password" htmlFor="a" error={er.pw}><input id="a" type="password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Confirm password" htmlFor="b" error={er.pw2}><input id="b" type="password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <Button type="submit" className="h-11 w-full rounded-xl">Update password</Button>
      </form>
    </AuthLayout>
  );
}
