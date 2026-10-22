import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button, Skeleton, TextInput } from "@/components/ui";
import { Wordmark } from "@/components/site-chrome";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (isPending) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-6 h-48" />
      </main>
    );
  }
  if (user) return <RedirectToSignIn to="/dashboard" />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/dashboard" });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Those details didn't match an account.");
      return;
    }
    void navigate({ to: "/dashboard" });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-primary px-10 py-12 text-surface lg:flex lg:flex-col lg:justify-between">
        <Wordmark tone="surface" />
        <div>
          <h1 className="font-display text-5xl">Find your stay.</h1>
          <p className="mt-4 max-w-sm text-surface/80">List your space. Sign in to manage trips, a listing, or the operator desk.</p>
        </div>
      </section>
      <section className="flex items-center px-4 py-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <h2 className="font-display text-4xl">Sign in</h2>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Email</span>
              <TextInput type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Password</span>
              <TextInput type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="space-y-2">
            {GROK_PROVIDERS.map((provider) => (
              <Button
                key={provider.providerId}
                type="button"
                variant="quiet"
                className="w-full"
                onClick={() => void signIn(provider.providerId, { callbackURL: "/dashboard" })}
              >
                Continue with {provider.label}
              </Button>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">
            New here?{" "}
            <Link to="/signup" className="font-medium text-primary">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
