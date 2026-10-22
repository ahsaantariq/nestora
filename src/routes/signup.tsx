import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Navigate } from "@tanstack/react-router";
import { Button, Skeleton, TextInput } from "@/components/ui";
import { Wordmark } from "@/components/site-chrome";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (isPending) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-6 h-56" />
      </main>
    );
  }
  if (user) return <Navigate to="/dashboard" />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
      callbackURL: "/dashboard",
    });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not create that account.");
      return;
    }
    void navigate({ to: "/dashboard" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Wordmark />
      <h1 className="mt-8 font-display text-4xl">Create an account</h1>
      <p className="mt-2 text-sm text-muted">You'll start as a guest. The first account on a new Nestora becomes the operator.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Name</span>
          <TextInput required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Email</span>
          <TextInput type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Password</span>
          <TextInput type="password" required autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already have one?{" "}
        <Link to="/login" className="font-medium text-primary">
          Sign in
        </Link>
      </p>
    </main>
  );
}
