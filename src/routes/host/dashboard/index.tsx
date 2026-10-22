import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadOwnerHome, ownerMonths } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, Stat } from "@/components/ui";

export const Route = createFileRoute("/host/dashboard/")({ component: HostHome });

function HostHome() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadOwnerHome>> | null>(null);
  const [series, setSeries] = useState<Awaited<ReturnType<typeof ownerMonths>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadOwnerHome()
      .then((row) => { if (!cancelled) setData(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load."); });
    ownerMonths()
      .then((rows) => { if (!cancelled) setSeries(rows); })
      .catch(() => { if (!cancelled) setSeries([]); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro eyebrow="Host" title="Dashboard" body="Views, bookings, and guest payments for spaces you own. Charts start once there is something to plot." />
      {error ? <EmptyState title="Dashboard didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-36" /> : null}
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Property views" value={String(data.views)} />
          <Stat label="Properties" value={String(data.properties)} />
          <Stat label="Bookings" value={String(data.bookings)} />
          <Stat label="In house now" value={String(data.current_stays)} />
          <Stat label="Upcoming" value={String(data.upcoming)} />
          <Stat label="Guest payments" value={formatMoney(data.revenue_cents)} note={`Estimated net at today's commission: ${formatMoney(data.estimatedNetCents)}`} />
        </div>
      ) : null}
      {series && series.length === 0 ? <div className="mt-6"><EmptyState title="No paid stays in the last six months" body="Revenue and occupancy charts use confirmed bookings on your listings. There aren't any yet." /></div> : null}
      {series && series.length > 0 ? (
        <div className="mt-6 h-64 rounded-card bg-surface p-4 shadow-soft">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.map((row) => ({ month: row.month, revenue: row.revenue_cents / 100, bookings: row.bookings }))}>
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="revenue" fill="#0F4C5C" radius={8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </>
  );
}
