import { useEffect, useState, type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { Role } from "@/lib/nestora/constants";
import { roleLabel } from "@/lib/nestora/constants";
import { sessionSecurityFn } from "@/lib/nestora/functions";
import { useProfile } from "@/components/profile-context";
import { SecurityPanel, TwoFactorChallenge } from "@/components/security-panel";
import { Button, Skeleton } from "@/components/ui";
import { Wordmark } from "@/components/site-chrome";

export function Workspace({
  allow,
  nav,
  children,
}: {
  allow: Role[];
  nav: ReactNode;
  children: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  const { profile, loading, error, reload } = useProfile();
  const [gate, setGate] = useState<"ok" | "2fa" | "setup" | "unverified" | "loading">("loading");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    sessionSecurityFn()
      .then((next) => { if (!cancelled) setGate(next.ok ? "ok" : next.reason); })
      .catch(() => { if (!cancelled) setGate("ok"); });
    return () => { cancelled = true; };
  }, [profile]);

  if (isPending || (user && loading && !profile)) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (error || !profile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-3xl">We couldn't open your account</h1>
        <p className="mt-3 text-sm text-muted">{error ?? "Try again."}</p>
        <Button className="mt-6" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }
  if (profile.accountStatus === "SUSPENDED") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-3xl">This account is paused</h1>
        <p className="mt-3 text-sm text-muted">
          This account is paused. You can still browse stays.
        </p>
        <Link to="/" className="mt-6 inline-flex h-11 items-center text-sm font-medium text-primary">
          Back to Nestora
        </Link>
      </div>
    );
  }
  if (!allow.includes(profile.role)) {
    const who = allow.map((role) => roleLabel(role).toLowerCase()).join(" or ");
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-3xl">This page isn't available</h1>
        <p className="mt-3 text-sm text-muted">
          It's for a {who}. You're signed in as a {roleLabel(profile.role).toLowerCase()}.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/dashboard" className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">
            Your trips
          </Link>
          {profile.role === "CUSTOMER" ? (
            <Link to="/host" className="inline-flex h-11 items-center rounded-button border border-line bg-surface px-4 text-sm font-medium">
              List your property
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  if (gate === "loading") {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (gate === "unverified") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-3xl">Please verify your email</h1>
        <p className="mt-3 text-sm text-muted">Open the link we sent you, then sign in again.</p>
        <Link to="/login" className="mt-6 inline-flex h-11 items-center text-sm font-medium text-primary">Back to sign in</Link>
      </div>
    );
  }
  if (gate === "2fa") return <TwoFactorChallenge onDone={() => setGate("ok")} />;
  if (gate === "setup") {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="font-display text-3xl">Security</h1>
        <div className="mt-6"><SecurityPanel forced /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <Wordmark />
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{roleLabel(profile.role)}</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">{nav}</nav>
      </aside>
      <div>
        <div className="flex items-center justify-end border-b border-line px-4 py-3">
          <Link to="/" className="text-sm text-muted hover:text-ink">
            View the site
          </Link>
        </div>
        <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      </div>
    </div>
  );
}

export function DeskLink({
  to,
  children,
  exact,
}: {
  to: LinkProps["to"];
  children: ReactNode;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: Boolean(exact) }}
      className="shrink-0 rounded-button px-3 py-2.5 text-sm text-ink hover:bg-bg"
      activeProps={{ className: "shrink-0 rounded-button bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary" }}
    >
      {children}
    </Link>
  );
}

export function PageIntro({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <header className="mb-8">
      {eyebrow ? <p className="text-xs font-medium uppercase tracking-wide text-primary">{eyebrow}</p> : null}
      <h1 className="mt-1 font-display text-4xl text-ink">{title}</h1>
      {body ? <p className="mt-3 max-w-2xl text-sm text-muted">{body}</p> : null}
    </header>
  );
}
