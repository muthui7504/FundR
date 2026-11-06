
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, inputCls } from "@/components/kit";
import { api } from "@/services/api";
import { GoogleMemberSignIn } from "@/components/auth/GoogleMemberSignIn";
import type { AuthUser } from "@/services/api";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    campaignCode: typeof search.campaignCode === "string" ? search.campaignCode : undefined,
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Log in — Fundraise" },
      {
        name: "description",
        content: "Log in to your Fundraise account.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const { campaignCode, invite } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");

  const completeLogin = async (user: AuthUser) => {
    const role = user.role;
    window.dispatchEvent(new Event("fundraise:auth-change"));

    if (role === "PLATFORM_ADMIN") {
      await nav({ to: "/platform-admin" });
    } else if (role === "ORGANISATION_ADMIN" || role === "ORGANISATION_STAFF") {
      await nav({ to: "/organisation" });
    } else if (role === "MEMBER") {
      if (campaignCode) {
        await nav({
          to: "/join/$code",
          params: { code: campaignCode },
          search: { invite },
        });
      } else {
        await nav({ to: "/member" });
      }
    } else {
      setError("Your account role is not recognised.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !pw) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);

    try {
      const response = await api.auth.login({
        email: email.trim(),
        password: pw,
      });

      await completeLogin(response.data.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to log in. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to manage your fundraising."
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-card sm:p-6">
          <Field label="Email address" htmlFor="email">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="email"
                type="email"
                className={`${inputCls} pl-10`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </Field>

          <Field label="Password" htmlFor="password">
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className={`${inputCls} pl-10 pr-12`}
                placeholder="Enter your password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {error && (
            <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-xl text-base font-semibold shadow-sm"
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Logging in..." : "Log in"}
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border bg-muted/30 p-5 sm:p-6">
          <div className="flex items-center gap-3 text-xs font-semibold tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>ACCOUNT SIGN IN</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {invite && (
            <Field label="Phone number (needed only for new accounts)" htmlFor="google-phone">
              <input
                id="google-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={inputCls}
                placeholder="0712 345 678"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
          )}
          <GoogleMemberSignIn
            invitationToken={invite}
            phone={phone}
            onAuthenticated={completeLogin}
          />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          New to Fundraise?{" "}
          <Link to="/register" search={{ campaignCode, invite }} className="font-semibold text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
