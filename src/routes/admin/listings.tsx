import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadPendingListings } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/listings")({ component: ListingsPage });

function ListingsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPendingListings>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPendingListings()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the queue."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Listing review" body="Approve a listing and it goes live. Reject it with a reason and the host can edit. The queue is empty until someone submits a property." />
      {error ? <EmptyState title="Queue didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="Nothing waiting" body="No property is in pending review." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-card bg-surface p-4 shadow-soft">
            <p className="font-medium">{row.title}</p>
            <p className="text-sm text-muted">{row.property_type.toLowerCase()} · {row.city} · {row.owner_name}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
