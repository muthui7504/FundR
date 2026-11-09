import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, inputCls } from "@/components/kit";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — FundR" }, { name: "description", content: "Reset your FundR password." }, { property: "og:title", content: "Forgot password — FundR" }, { property: "og:description", content: "Request a password reset link." }] }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState(""); const [err, setErr] = useState(""); const [sent, setSent] = useState(false);
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a secure reset link.">
      {sent ? (
        <div className="rounded-2xl border bg-card p-6 text-center">
          <MailCheck className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-semibold">Check your inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">If an account exists for {email}, a reset link is on its way.</p>
          <Button asChild variant="outline" className="mt-5"><Link to="/reset-password">Open reset page</Link></Button>
        </div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email."); setSent(true); }}>
          <Field label="Email" htmlFor="e" error={err}><input id="e" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err} /></Field>
          <Button type="submit" className="h-11 w-full rounded-xl">Send reset link</Button>
          <p className="text-center text-sm"><Link to="/login" search={{ campaignCode: undefined, invite: undefined }} className="text-primary">Back to login</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}
