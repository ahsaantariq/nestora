import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadOwnerBookings } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/host/bookings")({ component: HostBookings });

function HostBookings() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadOwnerBookings>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadOwnerBookings()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load bookings."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Bookings" body="Requests and confirmed stays for your properties." />
      {error ? <EmptyState title="Bookings didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No bookings" body="Guests haven't booked a space you own." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-muted">{row.check_in} → {row.check_out} · {formatMoney(row.total_cents)}</p>
            </div>
            <StatusPill>{row.status.toLowerCase()}</StatusPill>
          </li>
        ))}
      </ul>
    </>
  );
}
