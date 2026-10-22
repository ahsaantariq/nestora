import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink">
      <p className="text-sm font-medium text-danger">Something went wrong</p>
      <h1 className="font-display text-3xl">Nestora hit a snag</h1>
      <p className="max-w-md text-sm break-words text-muted">{errorMessage(error)}</p>
      <Link to="/" className="mt-3 inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">
        Back home
      </Link>
    </main>
  );
}
