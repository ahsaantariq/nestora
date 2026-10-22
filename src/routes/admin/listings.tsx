import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminDeletePropertyFn, loadAllPropertiesFn, loadPendingListings, reviewListing } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill, TextArea } from "@/components/ui";

export const Route = createFileRoute("/admin/listings")({ component: ListingsPage });

function ListingsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPendingListings>> | null>(null);
  const [all, setAll] = useState<Awaited<ReturnType<typeof loadAllPropertiesFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();

  function reload() {
    return Promise.all([loadPendingListings().then(setRows), loadAllPropertiesFn().then(setAll)]);
  }
  useEffect(() => {
    reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the queue."));
  }, []);

  async function decide(propertyId: string, decision: "APPROVE" | "REJECT") {
    setBusy(propertyId + decision);
    setError(null);
    try {
      await reviewListing({ data: { propertyId, decision, reason } });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that listing.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {confirm.dialog}
      <PageIntro title="Listing review" body="Approve a listing and it goes live. Reject it with a reason and the host can edit." />
      {error ? <EmptyState title="Queue didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="Nothing waiting" body="No property is in pending review." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="grid gap-4 rounded-card bg-surface p-4 shadow-soft md:grid-cols-2">
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-muted">{row.property_type.toLowerCase()} · {row.city || "No city"} · {row.owner_name}</p>
            </div>
            <div className="space-y-3">
              <TextArea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason, required if you reject" />
              <div className="flex gap-2">
                <Button type="button" loading={busy === row.id + "APPROVE"} loadingLabel="Approving..." onClick={() => void decide(row.id, "APPROVE")}>Approve</Button>
                <Button type="button" variant="danger" loading={busy === row.id + "REJECT"} loadingLabel="Rejecting..." onClick={() => void decide(row.id, "REJECT")}>Reject</Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <h2 className="mb-3 mt-10 font-display text-2xl">All properties</h2>
      <ul className="space-y-3">
        {all?.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-4 shadow-soft">
            <div>
              <p className="font-medium">{row.title}</p>
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
