import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { claimVerificationFn, prepareSignupFn } from "@/lib/nestora/functions";
import { AsyncForm, TextField } from "@/components/forms";
import { Button, Skeleton } from "@/components/ui";
import { Wordmark } from "@/components/site-chrome";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { user, isPending } = useCurrentUserState();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ delivered: boolean; fallbackUrl: string | null } | null>(null);

  if (isPending) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-6 h-56" />
      </main>
    );
  }
  if (user && !done) return <Navigate to="/dashboard" />;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Wordmark />
      <h1 className="mt-8 font-display text-4xl">Create your account</h1>
      <p className="mt-2 text-sm text-muted">Create your account to book stays.</p>
      {done ? (
        <div className="mt-6 space-y-3 text-sm">
          <p>{done.delivered ? "Check your email and open the verification link. You'll be signed in and taken to your trips." : "Email isn't set up yet. Use this one-time link to verify, then you'll be signed in."}</p>
          {done.fallbackUrl ? <a className="block break-all font-medium text-primary" href={done.fallbackUrl}>Verify email</a> : null}
        </div>
      ) : (
        <AsyncForm className="mt-6 space-y-4" onSubmit={async () => {
          setError(null);
          if (password !== confirm) {
            setError("Passwords don't match.");
            return;
          }
          if (!terms) {
            setError("Agree to the terms to continue.");
            return;
          }
          const prepared = await prepareSignupFn({ data: { email, kind: "CUSTOMER", payload: { name } } });
          const result = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: "/dashboard" });
          if (result.error) {
            setError(result.error.message ?? "Could not create that account.");
            return;
          }
          await authClient.signOut();
          const delivery = await claimVerificationFn({ data: { email, nonce: prepared.nonce } });
          setDone(delivery);
        }}>
          {(busy) => (
            <>
              <TextField label="Name" required autoComplete="name" value={name} onChange={setName} />
              <TextField label="Email" type="email" required autoComplete="email" value={email} onChange={setEmail} />
              <TextField label="Password" type="password" required autoComplete="new-password" value={password} onChange={setPassword} hint="At least 8 characters." />
              <TextField label="Confirm password" type="password" required autoComplete="new-password" value={confirm} onChange={setConfirm} />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 accent-primary" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
                I agree to the booking terms and house rules for each stay.
              </label>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" className="w-full" loading={busy} loadingLabel="Creating...">Create account</Button>
            </>
          )}
        </AsyncForm>
      )}
      <p className="mt-6 text-sm text-muted">
        Already have one? <Link to="/login" className="font-medium text-primary">Sign in</Link>
      </p>
    </main>
  );
}
