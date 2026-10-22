import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadCustomerHome } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, Stat } from "@/components/ui";

export const Route = createFileRoute("/dashboard/")({ component: Overview });

function Overview() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCustomerHome>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadCustomerHome()
      .then((row) => { if (!cancelled) setData(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro eyebrow="Guest" title="Your trips" body="Upcoming, past, and cancelled bookings from your account. Counts come from the database." />
      {error ? <EmptyState title="Overview didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-32" /> : null}
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Upcoming" value={String(data.upcoming)} />
          <Stat label="Completed" value={String(data.past)} />
          <Stat label="Cancelled" value={String(data.cancelled)} />
          <Stat label="Saved stays" value={String(data.saved)} />
          <Stat label="Cards on file" value={String(data.cards)} note="Brand and last four only." />
        </div>
      ) : null}
      {data && data.upcoming + data.past + data.cancelled === 0 ? (
        <div className="mt-6">
          <EmptyState title="No bookings yet" body="When you book a live stay, it will show up here with its status and refund, if you cancel." action={<Link to="/search" className="text-sm font-medium text-primary">Search stays</Link>} />
        </div>
      ) : null}
    </>
  );
}
