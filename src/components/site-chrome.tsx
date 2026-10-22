import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { TAGLINE } from "@/lib/nestora/constants";
import { useProfile } from "@/components/profile-context";
import { Skeleton } from "@/components/ui";

export function Wordmark({ tone = "ink" }: { tone?: "ink" | "surface" }) {
  return (
    <Link to="/" className={tone === "surface" ? "text-surface" : "text-primary"}>
      <span className="font-display text-2xl tracking-tight">Nestora</span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user, isPending } = useCurrentUserState();
  const { profile } = useProfile();

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/95 backdrop-blur">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Wordmark />
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link to="/search" className="text-ink hover:text-primary">
            Stays
          </Link>
          <Link to="/list" className="text-ink hover:text-primary">
            List your space
          </Link>
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <AuthLinks pending={isPending} signedIn={Boolean(user)} role={profile?.role} />
        </div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-button border border-line bg-surface md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-line px-4 py-4 md:hidden">
          <Link to="/search" className="block py-2" onClick={() => setOpen(false)}>
            Stays
          </Link>
          <Link to="/list" className="block py-2" onClick={() => setOpen(false)}>
            List your space
          </Link>
          <AuthLinks pending={isPending} signedIn={Boolean(user)} role={profile?.role} />
        </div>
      ) : null}
    </header>
  );
}

function AuthLinks({
  pending,
  signedIn,
  role,
}: {
  pending: boolean;
  signedIn: boolean;
  role?: "CUSTOMER" | "OWNER" | "ADMIN";
}) {
  if (pending) return <Skeleton className="h-10 w-28" />;
  if (!signedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" className="inline-flex h-11 items-center rounded-button px-3 text-sm font-medium text-ink">
          Sign in
        </Link>
        <Link
          to="/signup"
          className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface hover:bg-primary-hover"
        >
          Create account
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link to="/dashboard" className="text-sm font-medium text-ink hover:text-primary">
        Trips
      </Link>
      {role === "OWNER" || role === "ADMIN" ? (
        <Link to="/host" className="text-sm font-medium text-ink hover:text-primary">
          Host
        </Link>
      ) : null}
      {role === "ADMIN" ? (
        <Link to="/admin" className="text-sm font-medium text-primary">
          Operator
        </Link>
      ) : null}
      <UserButton />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="font-display text-xl text-primary">Nestora</p>
          <p className="mt-2 max-w-xs text-sm text-muted">{TAGLINE}</p>
        </div>
        <div className="text-sm">
          <p className="font-medium">Explore</p>
          <ul className="mt-3 space-y-2 text-muted">
            <li><Link to="/search" search={{ type: "HOTEL" }} className="hover:text-ink">Hotels</Link></li>
            <li><Link to="/search" search={{ type: "HOUSE" }} className="hover:text-ink">Houses</Link></li>
            <li><Link to="/search" search={{ type: "APARTMENT" }} className="hover:text-ink">Apartments</Link></li>
            <li><Link to="/search" search={{ type: "WAREHOUSE" }} className="hover:text-ink">Warehouses</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-medium">Host</p>
          <ul className="mt-3 space-y-2 text-muted">
            <li><Link to="/list" className="hover:text-ink">List your space</Link></li>
            <li><Link to="/host" className="hover:text-ink">Host desk</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
