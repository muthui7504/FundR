import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, inputCls } from "@/components/kit";
import { isValidKenyanPhone } from "@/utils/format";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { GoogleMemberSignIn } from "@/components/auth/GoogleMemberSignIn";
import type { AuthUser, InvitationCampaign } from "@/services/api";
import { InvitationCampaignDialog } from "@/components/auth/InvitationCampaignDialog";
import { isStrongPassword, passwordChecks, passwordError, passwordRequirements } from "@/utils/password";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
    campaignCode: typeof search.campaignCode === "string" ? search.campaignCode : undefined,
  }),
  head: () => ({ meta: [{ title: "Create account — FundR" }, { name: "description", content: "Register your organisation or join as a member." }, { property: "og:title", content: "Create your FundR account" }, { property: "og:description", content: "Register your organisation or join as a fundraiser." }] }),
  component: Register,
});

function Register() {
  const nav = useNavigate();
  const { invite, campaignCode } = Route.useSearch();
  const [type, setType] = useState<"org" | "member">(invite ? "member" : "org");
  const [f, setF] = useState({ name: "", email: "", phone: "", org: "", orgType: "Church", pw: "", pw2: "", terms: false });
  const [er, setEr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [resendingCode, setResendingCode] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState("");
  const [invitation, setInvitation] = useState<Awaited<ReturnType<typeof api.invitations.validate>> | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(Boolean(invite));
  const [invitationError, setInvitationError] = useState("");
  const [campaignsToChoose, setCampaignsToChoose] = useState<InvitationCampaign[]>([]);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const skipCampaignChoice = () => {
    setCampaignDialogOpen(false);
    void nav({ to: "/member" });
  };
  useEffect(() => {
    if (!invite) return;
    setType("member");
    setInvitationLoading(true);
    api.invitations.validate(invite, campaignCode)
      .then((result) => {
        setInvitation(result);
        if (result.invitedEmail) setF((current) => ({ ...current, email: result.invitedEmail ?? current.email }));
      })
      .catch((error) => setInvitationError(error instanceof Error ? error.message : "This invitation could not be validated."))
      .finally(() => setInvitationLoading(false));
  }, [invite, campaignCode]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const completeGoogleSignIn = async (user: AuthUser) => {
    let signedInUser = user;
    let activeCampaigns = invitation?.activeCampaigns ?? [];
    if (invite && user.role === "MEMBER") {
      const accepted = await api.invitations.accept(invite);
      signedInUser = accepted.data.user;
      activeCampaigns = accepted.data.invitation.activeCampaigns;
    }
    window.dispatchEvent(new Event("fundraise:auth-change"));
    if (campaignCode && signedInUser.role === "MEMBER") {
      await nav({
        to: "/join/$code",
        params: { code: campaignCode },
        search: { invite },
      });
    } else if (invite && signedInUser.role === "MEMBER" && activeCampaigns.length) {
      setCampaignsToChoose(activeCampaigns);
      setCampaignDialogOpen(true);
    } else {
      await nav({ to: signedInUser.role === "ORGANISATION_ADMIN" ? "/organisation" : "/member" });
    }
  };
  const finishPasswordRegistration = async (user: AuthUser) => {
    window.dispatchEvent(new Event("fundraise:auth-change"));
    if (campaignCode && user.role === "MEMBER") {
      await nav({
        to: "/join/$code",
        params: { code: campaignCode },
        search: { invite },
      });
    } else if (invite && user.role === "MEMBER" && invitation?.activeCampaigns.length) {
      setCampaignsToChoose(invitation.activeCampaigns);
      setCampaignDialogOpen(true);
    } else {
      await nav({ to: user.role === "ORGANISATION_ADMIN" ? "/organisation" : "/member" });
    }
  };
  const verifyEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerificationError("");
    if (!/^\d{6}$/.test(verificationCode)) {
      setVerificationError("Enter the six-digit code sent to your email.");
      return;
    }
    setBusy(true);
    try {
      const response = await api.auth.verifyEmail({
        email: f.email.trim().toLowerCase(),
        code: verificationCode,
      });
      await finishPasswordRegistration(response.data.user);
    } catch (cause) {
      setVerificationError(cause instanceof Error ? cause.message : "Unable to verify your email. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const resendVerificationCode = async () => {
    setResendingCode(true);
    setVerificationError("");
    setVerificationNotice("");
    try {
      await api.auth.resendVerification(f.email.trim().toLowerCase());
      setVerificationNotice("A new verification code has been sent.");
      setVerificationCode("");
    } catch (cause) {
      setVerificationError(cause instanceof Error ? cause.message : "Unable to resend the code. Please try again.");
    } finally {
      setResendingCode(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const x: Record<string, string> = {};
    if (f.name.trim().length < 2) x.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) x.email = "Enter a valid email.";
    if (!isValidKenyanPhone(f.phone)) x.phone = "Use a Kenyan number e.g. 0712 345 678.";
    if (type === "org" && f.org.trim().length < 2) x.org = "Enter your organisation's name.";
    if (!isStrongPassword(f.pw)) x.pw = passwordError(f.pw);
    if (f.pw !== f.pw2) x.pw2 = "Passwords do not match.";
    if (!f.terms) x.terms = "Please accept the terms.";
    if (invite && (!invitation || !invitation.canJoin)) {
      setInvitationError(invitation ? "This campaign has reached its member limit. Please contact the organisation to upgrade its campaign plan." : "Wait while this invitation is validated.");
      return;
    }
    setEr(x);
    if (Object.keys(x).length) return;
    setBusy(true);
    try {
      const response = await api.auth.register({
        name: f.name,
        email: f.email,
        phone: f.phone,
        password: f.pw,
        invitationToken: invite,
        organisationName: type === "org" ? f.org : undefined,
        organisationType: type === "org" ? f.orgType : undefined,
      });
      if (response.data.verificationRequired) setVerificationPending(true);
    } catch (error) {
      setEr({ email: error instanceof Error ? error.message : "Unable to create your account." });
    } finally {
      setBusy(false);
    }
  };
  if (verificationPending) {
    return (
      <AuthLayout title="Check your email" subtitle="Verify your email address to finish creating your account.">
        <form onSubmit={verifyEmail} className="space-y-5">
          <div className="rounded-2xl border bg-card p-5 text-center shadow-card sm:p-6">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
              <MailCheck className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              We sent a six-digit verification code to
            </p>
            <p className="mt-1 break-all font-semibold text-foreground">{f.email}</p>
            <Field label="Verification code" htmlFor="verification-code">
              <input
                id="verification-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                className={`${inputCls} mt-5 text-center text-xl font-semibold tracking-[0.35em]`}
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                aria-describedby={verificationError ? "verification-error" : undefined}
                aria-invalid={Boolean(verificationError)}
                required
              />
            </Field>
            {verificationError && (
              <p id="verification-error" className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-left text-sm text-destructive" role="alert">
                {verificationError}
              </p>
            )}
            {verificationNotice && <p className="mt-3 text-sm text-success" role="status">{verificationNotice}</p>}
            <Button type="submit" className="mt-5 h-12 w-full rounded-xl" disabled={busy || verificationCode.length !== 6}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Verifying..." : "Verify email and create account"}
            </Button>
            <Button type="button" variant="ghost" className="mt-2 w-full" disabled={resendingCode} onClick={() => void resendVerificationCode()}>
              {resendingCode && <Loader2 className="h-4 w-4 animate-spin" />}
              {resendingCode ? "Sending code..." : "Resend verification code"}
            </Button>
          </div>
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setVerificationPending(false);
              setVerificationCode("");
              setVerificationError("");
              setVerificationNotice("");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to account details
          </button>
        </form>
        <InvitationCampaignDialog
          campaigns={campaignsToChoose}
          open={campaignDialogOpen}
          onSkip={skipCampaignChoice}
        />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Create your account" subtitle="Start raising funds with your community.">
      {invite && (
        <div className="mb-6 rounded-xl border bg-card p-4">
          {invitationLoading ? <p className="text-sm text-muted-foreground">Validating invitation…</p> : invitationError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{invitationError}</p>
              {invitation?.organisation.email && <a className="underline" href={`mailto:${invitation.organisation.email}`}>Contact {invitation.organisation.name}</a>}
              {invitation?.organisation.phone && <a className="block underline" href={`tel:${invitation.organisation.phone}`}>Call the organisation</a>}
            </div>
          ) : invitation && (
            <div className="space-y-1">
              <p className="text-sm font-semibold">Invitation to join {invitation.organisation.name}</p>
              <p className="text-xs text-muted-foreground">Invitation expires {new Date(invitation.expiresAt).toLocaleDateString()}.</p>
              {!invitation.canJoin && <div role="alert" className="mt-3 space-y-2 text-sm text-destructive">
                <p>This campaign has reached its current member limit. Its organisation administrator must upgrade this campaign’s subscription before more participants can join. The organisation can still have members outside this campaign.</p>
                {invitation.organisation.email && <a className="underline" href={`mailto:${invitation.organisation.email}`}>Email the organization</a>}
                {invitation.organisation.phone && <a className="block underline" href={`tel:${invitation.organisation.phone}`}>Call the organization</a>}
              </div>}
            </div>
          )}
        </div>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="n" error={er.name}><input id="n" className={inputCls} value={f.name} onChange={set("name")} aria-invalid={!!er.name} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="e" error={er.email}><input id="e" type="email" className={inputCls} value={f.email} onChange={set("email")} aria-invalid={!!er.email} /></Field>
          <Field label="Phone" htmlFor="p" error={er.phone}><input id="p" inputMode="tel" placeholder="0712 345 678" className={inputCls} value={f.phone} onChange={set("phone")} aria-invalid={!!er.phone} /></Field>
        </div>
        {!invite && type === "org" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation name" htmlFor="o" error={er.org}><input id="o" className={inputCls} value={f.org} onChange={set("org")} aria-invalid={!!er.org} /></Field>
            <Field label="Type" htmlFor="t"><select id="t" className={inputCls} value={f.orgType} onChange={set("orgType")}>{["Church", "NGO", "School", "Charity", "Welfare group", "Community organisation"].map((o) => <option key={o}>{o}</option>)}</select></Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="pw" error={er.pw}><input id="pw" type="password" className={inputCls} value={f.pw} onChange={set("pw")} aria-invalid={!!er.pw} /><PasswordRequirements password={f.pw} /></Field>
          <Field label="Confirm password" htmlFor="pw2" error={er.pw2}><input id="pw2" type="password" className={inputCls} value={f.pw2} onChange={set("pw2")} aria-invalid={!!er.pw2} /></Field>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={f.terms} onChange={set("terms")} />I agree to the Terms of Service and Privacy Policy.</label>
        {er.terms && <p className="text-xs text-destructive">{er.terms}</p>}
        <Button type="submit" disabled={busy || !isStrongPassword(f.pw) || invitationLoading || Boolean(invite && !invitation?.canJoin)} className="h-11 w-full rounded-xl">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Creating account..." : "Create account"}</Button>
        {invite && type === "member" && invitation?.canJoin && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>OR CONTINUE WITH GOOGLE</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <GoogleMemberSignIn
              invitationToken={invite}
              phone={f.phone}
              onAuthenticated={completeGoogleSignIn}
            />
          </div>
        )}
        <p className="text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" search={{ campaignCode, invite }} className="font-medium text-primary">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}

function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const values = [checks.length, checks.uppercase, checks.lowercase, checks.number, checks.special, checks.noSequentialNumbers];
  return <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">{passwordRequirements.map((requirement, index) => <li key={requirement} className={values[index] ? "text-success" : ""}>{values[index] ? "✓" : "○"} {requirement}</li>)}</ul>;
}
