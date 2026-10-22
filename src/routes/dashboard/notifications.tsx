import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadNotes, readNotes } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/dashboard/notifications")({ component: NotesPage });

function NotesPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadNotes>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadNotes()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load notifications."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Notifications" body="Bookings, cancellations, refunds, approvals, and payouts land here." />
      <Button variant="quiet" className="mb-4" loading={reading} loadingLabel="Saving..." onClick={() => {
        setReading(true);
        readNotes()
          .then(() => setRows((current) => current?.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })) ?? current))
          .finally(() => setReading(false));
      }}>Mark all read</Button>
      {error ? <EmptyState title="Notifications didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No notifications" body="When something happens on your account, it will show up here." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-card bg-surface p-4 shadow-soft">
            <p className="font-medium">{row.title}</p>
            <p className="mt-1 text-sm text-muted">{row.body}</p>
            <p className="mt-2 text-xs text-muted">{row.read_at ? "Read" : "Unread"}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
