import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cancelTrip, retryRefundFn } from "@/lib/nestora/functions";
import { searchBookingsFn } from "@/lib/nestora/content.fns";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { DateField, SelectField, TextField } from "@/components/forms";
import { EmptyState, Skeleton, StatusPill, Button } from "@/components/ui";

export const Route = createFileRoute("/admin/bookings")({ component: AdminBookings });

type Row = Awaited<ReturnType<typeof searchBookingsFn>>[number];

const STATUSES = ["", "PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "REFUNDED"];

function AdminBookings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [property, setProperty] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function load(next = { q, status, owner, property, from, to }) {
    setError(null);
    return searchBookingsFn({ data: next })
      .then(setRows)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load bookings."));
  }

  useEffect(() => { void load(); }, []);

  return (
    <>
      <PageIntro title="Bookings" body="Every booking with the property, the owner, and the guest. Cancel a confirmed stay to refund the original card." />
      <form className="mb-6 grid gap-3 rounded-card bg-surface p-4 shadow-soft md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <TextField label="Search" value={q} onChange={setQ} placeholder="Guest, property, or owner" />
        <TextField label="Property" value={property} onChange={setProperty} placeholder="Title or city" />
        <TextField label="Owner" value={owner} onChange={setOwner} />
        <SelectField label="Status" value={status} onChange={setStatus} options={STATUSES.map((item) => ({ value: item, label: item ? item.replaceAll("_", " ").toLowerCase() : "Any status" }))} />
        <DateField label="Check-in from" value={from} onChange={setFrom} />
        <DateField label="Check-out to" value={to} onChange={setTo} />
        <div className="md:col-span-3"><Button type="submit">Search</Button></div>
      </form>
      {error ? <EmptyState title="Bookings didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No bookings" body="Nothing matches these filters." /> : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-card bg-surface shadow-soft">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-3 py-3 font-medium">Property</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Owner</th>
                <th className="px-3 py-3 font-medium">Guest</th>
                <th className="px-3 py-3 font-medium">Dates</th>
                <th className="px-3 py-3 font-medium">Guests</th>
                <th className="px-3 py-3 font-medium">Total</th>
                <th className="px-3 py-3 font-medium">Payment</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line/70 align-top">
                  <td className="px-3 py-3"><Link to="/stay/$slug" params={{ slug: row.slug }} className="font-medium text-primary">{row.title}</Link></td>
                  <td className="px-3 py-3 capitalize">{row.property_type.toLowerCase()}</td>
                  <td className="px-3 py-3">{row.owner_name}</td>
                  <td className="px-3 py-3">{row.guest_name}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{row.check_in} → {row.check_out}</td>
                  <td className="px-3 py-3">{row.adults + row.children + row.infants}</td>
                  <td className="px-3 py-3 tabular-nums">{formatMoney(row.total_cents, row.currency.toUpperCase())}</td>
                  <td className="px-3 py-3">{row.payment_status ? row.payment_status.toLowerCase() : "—"}</td>
                  <td className="px-3 py-3"><StatusPill>{row.status.toLowerCase()}</StatusPill></td>
                  <td className="px-3 py-3">
                    {row.status === "CONFIRMED" || row.status === "PENDING" ? (
                      <Button variant="danger" loading={busy === row.id + "cancel"} loadingLabel="Cancelling..." onClick={() => {
                        setBusy(row.id + "cancel");
                        cancelTrip({ data: { bookingId: row.id } }).then(() => load()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not cancel.")).finally(() => setBusy(null));
                      }}>Cancel</Button>
                    ) : null}
                    {row.status === "CANCELLED" ? (
                      <Button variant="quiet" loading={busy === row.id + "refund"} loadingLabel="Retrying..." onClick={() => {
                        setBusy(row.id + "refund");
                        retryRefundFn({ data: { bookingId: row.id } }).then(() => load()).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Refund retry failed.")).finally(() => setBusy(null));
                      }}>Retry refund</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
