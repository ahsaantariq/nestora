import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadPendingListings, reviewListing } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { Button, EmptyState, Skeleton, TextArea } from "@/components/ui";

export const Route = createFileRoute("/admin/listings")({ component: ListingsPage });

function ListingsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPendingListings>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  function reload() {
    loadPendingListings().then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the queue."));
  }
  useEffect(() => { reload(); }, []);
  return (
    <>
      <PageIntro title="Listing review" body="Approve a listing and it goes live. Reject it with a reason and the host can edit. The queue is empty until someone submits a property." />
      {error ? <EmptyState title="Queue didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="Nothing waiting" body="No property is in pending review." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="grid gap-4 rounded-card bg-surface p-4 shadow-soft md:grid-cols-2">
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-muted">{row.property_type.toLowerCase()} · {row.city || "No city"} · {row.owner_name}</p>
              <p className="mt-3 text-sm text-muted">Public URL will be /stay/{row.slug} after approval.</p>
            </div>
            <div className="space-y-3">
              <TextArea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason, required if you reject" />
              <div className="flex gap-2">
                <Button type="button" onClick={() => reviewListing({ data: { propertyId: row.id, decision: "APPROVE", reason } }).then(reload).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not approve."))}>Approve</Button>
                <Button type="button" variant="danger" onClick={() => reviewListing({ data: { propertyId: row.id, decision: "REJECT", reason } }).then(reload).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not reject."))}>Reject</Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
