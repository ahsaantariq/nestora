import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { TAGLINE } from "@/lib/nestora/constants";
import { loadPublicChromeFn } from "@/lib/nestora/content.fns";
import { useProfile } from "@/components/profile-context";
import { Skeleton } from "@/components/ui";

type NavLink = { id: string; placement: string; column_name: string; label: string; href: string };

const FALLBACK_HEADER: NavLink[] = [
  { id: "stays", placement: "HEADER", column_name: "", label: "Stays", href: "/search" },
  { id: "how", placement: "HEADER", column_name: "", label: "How it works", href: "/how-it-works" },
  { id: "host", placement: "HEADER", column_name: "", label: "List your property", href: "/host" },
];

const FALLBACK_FOOTER: NavLink[] = [
  { id: "about", placement: "FOOTER", column_name: "Company", label: "About", href: "/about" },
  { id: "contact", placement: "FOOTER", column_name: "Company", label: "Contact", href: "/contact" },
  { id: "search", placement: "FOOTER", column_name: "Guests", label: "Find a stay", href: "/search" },
  { id: "faqs", placement: "FOOTER", column_name: "Guests", label: "FAQs", href: "/faqs" },
  { id: "help", placement: "FOOTER", column_name: "Guests", label: "Help center", href: "/help" },
  { id: "guest", placement: "FOOTER", column_name: "Guests", label: "Guest policy", href: "/guest-policy" },
  { id: "list", placement: "FOOTER", column_name: "Hosts", label: "List your property", href: "/host" },
  { id: "how2", placement: "FOOTER", column_name: "Hosts", label: "How it works", href: "/how-it-works" },
  { id: "hostpol", placement: "FOOTER", column_name: "Hosts", label: "Host policy", href: "/host-policy" },
  { id: "privacy", placement: "FOOTER", column_name: "Legal", label: "Privacy", href: "/privacy" },
  { id: "terms", placement: "FOOTER", column_name: "Legal", label: "Terms", href: "/terms" },
  { id: "cookies", placement: "FOOTER", column_name: "Legal", label: "Cookies", href: "/cookies" },
  { id: "cancel", placement: "FOOTER", column_name: "Legal", label: "Cancellation", href: "/cancellation" },
  { id: "safety", placement: "FOOTER", column_name: "Legal", label: "Safety", href: "/safety" },
];

export function Wordmark({ tone = "ink" }: { tone?: "ink" | "surface" }) {
  return (
    <Link to="/" className={tone === "surface" ? "text-surface" : "text-primary"}>
      <span className="font-display text-2xl tracking-tight">Nestora</span>
    </Link>
  );
}

function useChrome() {
  const [links, setLinks] = useState<NavLink[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPublicChromeFn()
      .then((next) => { if (!cancelled) setLinks(next.links); })
      .catch(() => { if (!cancelled) setLinks([]); });
    return () => { cancelled = true; };
  }, []);
  const header = (links ?? FALLBACK_HEADER).filter((link) => link.placement === "HEADER");
  const footer = (links && links.some((link) => link.placement === "FOOTER") ? links : FALLBACK_FOOTER).filter((link) => link.placement === "FOOTER");
  return {
    header: header.length > 0 ? header : FALLBACK_HEADER,
    footer,
  };
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user, isPending } = useCurrentUserState();
  const { profile } = useProfile();
  const { header } = useChrome();

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/95 backdrop-blur">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Wordmark />
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {header.map((link) => (
            <a key={link.id} href={link.href} className="text-ink hover:text-primary">{link.label}</a>
          ))}
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
          {header.map((link) => (
            <a key={link.id} href={link.href} className="block py-2" onClick={() => setOpen(false)}>{link.label}</a>
          ))}
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
        <Link to="/signup" className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface hover:bg-primary-hover">
          Sign up
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
        <Link to="/host/dashboard" className="text-sm font-medium text-ink hover:text-primary">Host</Link>
      ) : null}
      {role === "ADMIN" ? (
        <Link to="/admin" className="text-sm font-medium text-primary">Admin</Link>
      ) : null}
      <UserButton />
    </div>
  );
}

export function SiteFooter() {
  const { footer } = useChrome();
  const columns = ["Company", "Guests", "Hosts", "Legal"];
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-1">
          <p className="font-display text-xl text-primary">Nestora</p>
          <p className="mt-2 max-w-xs text-sm text-muted">{TAGLINE}</p>
        </div>
        {columns.map((column) => (
          <div key={column} className="text-sm">
            <p className="font-medium">{column}</p>
            <ul className="mt-3 space-y-2 text-muted">
              {footer.filter((link) => link.column_name === column).map((link) => (
                <li key={link.id}><a href={link.href} className="hover:text-ink">{link.label}</a></li>
              ))}
            </ul>
          </div>
        ))}
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
