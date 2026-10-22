import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 font-display text-4xl text-ink">That page isn't on the map</h1>
      <p className="mt-3 text-sm text-muted">The link may be old, or the stay was never listed.</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">
        Back to Nestora
      </Link>
    </main>
  );
}
