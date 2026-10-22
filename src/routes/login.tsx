import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ensureProfile, resendVerificationFn, sessionSecurityFn } from "@/lib/nestora/functions";
import { useProfile } from "@/components/profile-context";
import { AsyncForm, TextField } from "@/components/forms";
import { TwoFactorChallenge } from "@/components/security-panel";
import { Button, Skeleton } from "@/components/ui";
import { Wordmark } from "@/components/site-chrome";

export const Route = createFileRoute("/login")({ component: LoginPage });

function homeFor(role?: string) {
  if (role === "ADMIN") return "/admin";
  if (role === "OWNER") return "/host/dashboard";
  return "/dashboard";
}

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);

  if (isPending || (user && loading && !needCode)) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-6 h-48" />
      </main>
    );
  }
  if (user && !needCode && profile) return <Navigate to={homeFor(profile.role)} />;
  if (needCode) return <TwoFactorChallenge onDone={() => { setNeedCode(false); void ensureProfile().then((next) => navigate({ to: homeFor(next.role) })); }} />;

  async function onSubmit() {
    setError(null);
    setInfo(null);
    setFallback(null);
    const result = await authClient.signIn.email({ email: email.trim(), password });
    if (result.error) {
      const message = result.error.message ?? "Those details didn't match an account.";
      if (/verif/i.test(message)) {
        setUnverified(true);
        setError("Please verify your email.");
        return;
      }
      setError(message);
      return;
    }
    const next = await ensureProfile();
    const gate = await sessionSecurityFn();
    if (!gate.ok && gate.reason === "2fa") {
      setNeedCode(true);
      return;
    }
    void navigate({ to: homeFor(next.role) });
  }

  async function resend(event: FormEvent) {
    event.preventDefault();
    setInfo(null);
    setFallback(null);
    try {
      const result = await resendVerificationFn({ data: { email, password } });
      if (result.alreadyVerified) setInfo("This email is already verified. Sign in again.");
      else if (result.delivered) setInfo("We sent another verification email.");
      else {
        setInfo("Email isn't set up yet, so use this one-time link.");
        setFallback(result.fallbackUrl);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not resend the email.");
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-primary px-10 py-12 text-surface lg:flex lg:flex-col lg:justify-between">
        <Wordmark tone="surface" />
        <div>
          <h1 className="font-display text-5xl">Find your stay.</h1>
          <p className="mt-4 max-w-sm text-surface/80">Sign in to manage trips, a listing, or your account.</p>
        </div>
      </section>
      <section className="flex items-center px-4 py-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Wordmark /></div>
          <h2 className="font-display text-4xl">Sign in</h2>
          <AsyncForm className="mt-6 space-y-4" onSubmit={onSubmit}>
            {(busy) => (
              <>
                <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={setEmail} />
                <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={setPassword} />
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                {unverified ? (
                  <Button type="button" variant="quiet" className="w-full" onClick={(event) => void resend(event)}>Resend email</Button>
                ) : null}
                {info ? <p className="text-sm text-muted">{info}</p> : null}
                {fallback ? <a className="block break-all text-sm text-primary" href={fallback}>Verify email</a> : null}
                <Button type="submit" className="w-full" loading={busy} loadingLabel="Signing in...">Sign in</Button>
              </>
            )}
          </AsyncForm>
          <p className="mt-6 text-sm text-muted">
            New here? <Link to="/signup" className="font-medium text-primary">Sign up</Link>
            {" · "}
            <Link to="/host" className="font-medium text-primary">List your property</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
