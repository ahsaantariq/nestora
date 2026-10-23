import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminDeletePropertyFn, loadAllPropertiesFn, loadPendingListings } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/listings")({ component: ListingsPage });

function ListingsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPendingListings>> | null>(null);
  const [all, setAll] = useState<Awaited<ReturnType<typeof loadAllPropertiesFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  function reload() {
    return Promise.all([loadPendingListings().then(setRows), loadAllPropertiesFn().then(setAll)]);
  }
  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the queue."));
  }, []);

  return (
    <>
      {confirm.dialog}
      <PageIntro title="Listing review" body="Open a listing to read every field, edit it, and approve, request changes, or reject it." />
      {error ? <EmptyState title="Queue didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="Nothing waiting" body="No property is in pending review." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
            <div>
              <Link to="/admin/review/$propertyId" params={{ propertyId: row.id }} className="font-medium hover:text-primary">{row.title}</Link>
              <p className="text-sm text-muted">{row.property_type.toLowerCase()} · {row.city || "No city"} · {row.owner_name}</p>
            </div>
            <Link to="/admin/review/$propertyId" params={{ propertyId: row.id }} className="inline-flex h-11 items-center rounded-[10px] bg-primary px-4 text-sm font-medium text-surface">Review</Link>
          </li>
        ))}
      </ul>
      <h2 className="mb-3 mt-10 font-display text-2xl">All properties</h2>
      <ul className="space-y-3">
        {all?.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-4 shadow-soft">
            <div>
              <Link to="/admin/review/$propertyId" params={{ propertyId: row.id }} className="font-medium hover:text-primary">{row.title}</Link>
              <p className="text-sm text-muted">{row.city || "No city"} · {row.owner}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill>{row.status.replaceAll("_", " ").toLowerCase()}</StatusPill>
              <Button variant="danger" onClick={() => confirm.ask("Delete this property?", "Properties with bookings can't be deleted. Pause those instead.", async () => {
                await adminDeletePropertyFn({ data: { id: row.id } });
                await reload();
              })}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
