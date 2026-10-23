import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadMyBookings } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/dashboard/bookings")({ component: BookingsPage });

function BookingsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadMyBookings>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  useEffect(() => {
    let cancelled = false;
    loadMyBookings()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load bookings."); });
    return () => { cancelled = true; };
  }, []);
  const filtered = (rows ?? []).filter((row) => {
    if (tab === "cancelled") return row.status === "CANCELLED" || row.status === "REFUNDED";
    if (tab === "past") return row.status === "COMPLETED";
    return row.status === "PENDING" || row.status === "CONFIRMED" || row.status === "CHECKED_IN";
  });
  return (
    <>
      <PageIntro title="My bookings" body="A pending booking holds its dates for 15 minutes during checkout. Confirmed stays stay on the calendar until you cancel." />
      <div className="mb-4 flex gap-2">
        {(["upcoming", "past", "cancelled"] as const).map((item) => (
          <button key={item} type="button" className={`h-10 rounded-button px-3 text-sm capitalize ${tab === item ? "bg-primary text-surface" : "bg-surface text-ink shadow-soft"}`} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      {error ? <EmptyState title="Bookings didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-28" /> : null}
      {rows && filtered.length === 0 ? (
        <EmptyState title={`No ${tab} bookings`} body="This list only shows bookings on your account." action={<Link to="/search" className="text-sm font-medium text-primary">Find a stay</Link>} />
      ) : null}
      <ul className="space-y-3">
        {filtered.map((row) => (
          <li key={row.id} className="rounded-card bg-surface p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link to="/stay/$slug" params={{ slug: row.slug }} className="font-medium hover:text-primary">{row.title}</Link>
                <p className="text-sm text-muted">{row.property_type.toLowerCase()} · {row.check_in} → {row.check_out} · {row.city}</p>
                <p className="mt-1 text-sm text-muted">{row.adults + row.children + row.infants} guests · {row.payment_status ? `Payment ${row.payment_status.toLowerCase()}` : "Payment not started"}</p>
              </div>
              <StatusPill>{row.status.toLowerCase()}</StatusPill>
            </div>
            <p className="mt-3 text-sm tabular-nums">{formatMoney(row.total_cents, row.currency.toUpperCase())}</p>
            <Link to="/trips/$bookingId" params={{ bookingId: row.id }} className="mt-3 inline-flex text-sm font-medium text-primary">
              Receipt and cancellation
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
