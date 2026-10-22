import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadOwnerHome } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, Stat } from "@/components/ui";

export const Route = createFileRoute("/host/")({ component: HostHome });

function HostHome() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadOwnerHome>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadOwnerHome()
      .then((row) => { if (!cancelled) setData(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load."); });
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
    </>
  );
}
