import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadAdminHome } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { useProfile } from "@/components/profile-context";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, Stat } from "@/components/ui";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const { profile } = useProfile();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAdminHome>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAdminHome()
      .then((row) => { if (!cancelled) setData(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load."); });
    return () => { cancelled = true; };
  }, []);
  const founder = data?.founderUserId && profile?.userId === data.founderUserId;
  return (
    <>
      <PageIntro
        eyebrow="Operator"
        title="Overview"
        body={founder ? "You opened Nestora first, so this account is the operator. Later accounts stay guests until you approve them." : "Revenue, bookings, hosts, and listings waiting on you."}
      />
      {error ? <EmptyState title="Overview didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-32" /> : null}
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Succeeded payments" value={formatMoney(data.guest_payments_cents)} />
          <Stat label="Bookings" value={String(data.bookings)} />
          <Stat label="Hosts" value={String(data.owners)} />
          <Stat label="Guests" value={String(data.customers)} />
          <Stat label="Listings to review" value={String(data.pending_listings)} />
          <Stat label="Host requests" value={String(data.pending_owners)} />
        </div>
      ) : null}
    </>
  );
}
