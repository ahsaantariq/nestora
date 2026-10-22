import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cancelTrip, loadAdminTables, retryRefundFn } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, StatusPill, Button } from "@/components/ui";

export const Route = createFileRoute("/admin/bookings")({ component: AdminBookings });

function AdminBookings() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAdminTables>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAdminTables()
      .then((next) => { if (!cancelled) setData(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load bookings."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Bookings" body="Cancel a booking to refund the original card under that stay's policy. If the refund fails, retry it." />
      {error ? <EmptyState title="Bookings didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-24" /> : null}
      {data && data.bookings.length === 0 ? <EmptyState title="No bookings" body="The bookings table is empty." /> : null}
      <ul className="space-y-3">
        {data?.bookings.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded-card bg-surface p-4 shadow-soft">
            <div>
              <p className="text-sm">{row.check_in} → {row.check_out}</p>
              <p className="tabular-nums">{formatMoney(row.total_cents)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill>{row.status.toLowerCase()}</StatusPill>
              {row.status === "CONFIRMED" || row.status === "PENDING" ? (
                <Button variant="danger" loading={busy === row.id + "cancel"} loadingLabel="Cancelling..." onClick={() => {
                  setBusy(row.id + "cancel");
                  cancelTrip({ data: { bookingId: row.id } })
                    .then(() => loadAdminTables().then(setData))
                    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not cancel."))
                    .finally(() => setBusy(null));
                }}>Cancel</Button>
              ) : null}
              {row.status === "CANCELLED" ? (
                <Button variant="quiet" loading={busy === row.id + "refund"} loadingLabel="Retrying..." onClick={() => {
                  setBusy(row.id + "refund");
                  retryRefundFn({ data: { bookingId: row.id } })
                    .then(() => loadAdminTables().then(setData))
                    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Refund retry failed."))
                    .finally(() => setBusy(null));
                }}>Retry refund</Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
