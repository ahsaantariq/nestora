import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { requestOwner } from "@/lib/nestora/functions";
import { useProfile } from "@/components/profile-context";
import { PublicFrame } from "@/components/site-chrome";
import { Button, TextArea } from "@/components/ui";

export const Route = createFileRoute("/list")({ component: ListPage });

function ListPage() {
  const { user, isPending } = useCurrentUserState();
  const { profile, reload } = useProfile();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await requestOwner({ data: { note } });
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send that.");
    } finally {
      setPending(false);
    }
  }

  let body = null;
  if (isPending) {
    body = <p className="text-sm text-muted">Checking your account…</p>;
  } else if (!user) {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-muted">Sign in first. Listing a space is tied to your account, not a shared form.</p>
        <Link to="/signup" className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">
          Create an account
        </Link>
      </div>
    );
  } else if (profile?.role === "ADMIN" || profile?.role === "OWNER" || profile?.ownerStatus === "APPROVED") {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-muted">Your host desk is open. The listing form is the next piece of Nestora — the desk is ready for it.</p>
        <Link to="/host" className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">
          Open the host desk
        </Link>
      </div>
    );
  } else if (profile?.ownerStatus === "PENDING") {
    body = <p className="text-sm text-muted">Your request is with the operator. You'll get the host desk when it's approved.</p>;
  } else if (profile?.ownerStatus === "REJECTED") {
    body = (
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-danger">The last request was declined{profile.ownerNote ? `: ${profile.ownerNote}` : "."}</p>
        <TextArea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What do you want to list?" maxLength={500} />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Ask again"}</Button>
      </form>
    );
  } else {
    body = (
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">What will you list?</span>
          <TextArea value={note} onChange={(event) => setNote(event.target.value)} placeholder="A house in Lisbon, a small hotel, a warehouse loft…" maxLength={500} />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Request the host desk"}</Button>
      </form>
    );
  }

  return (
    <PublicFrame>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-primary">For hosts</p>
          <h1 className="mt-2 font-display text-5xl">List your space.</h1>
          <p className="mt-4 max-w-md text-muted">
            Hotels, houses, apartments, and warehouses. You keep the calendar, or you hand the stay to Nestora and the managed fees are shown before anyone is paid.
          </p>
        </div>
        <div className="rounded-card bg-surface p-6 shadow-soft">{body}</div>
      </div>
    </PublicFrame>
  );
}
