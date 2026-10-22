import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadAdminHome, loadIntegrationsFn } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, Stat } from "@/components/ui";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAdminHome>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailOff, setMailOff] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadAdminHome()
      .then((row) => { if (!cancelled) setData(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load."); });
    loadIntegrationsFn()
      .then((row) => { if (!cancelled) setMailOff(!row.smtpConfigured); })
      .catch(() => { if (!cancelled) setMailOff(false); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro
        eyebrow="Admin"
        title="Overview"
        body="Review listings, hosts, and payments. Guests and hosts sign up on their own."
      />
      {mailOff ? (
        <p className="mb-4 rounded-[10px] border border-accent/40 bg-accent/10 px-4 py-3 text-sm">Email is not set up. Open Integrations and add SMTP, or mail will stay in the email log.</p>
      ) : null}
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
