import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadAdminTables } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/payments")({ component: PaymentsPage });

function PaymentsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAdminTables>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAdminTables()
      .then((next) => { if (!cancelled) setData(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load payments."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Payments and refunds" body="Stripe payment intents land here after checkout. Card numbers are never stored." />
      {error ? <EmptyState title="Payments didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-24" /> : null}
      {data && data.payments.length === 0 ? <EmptyState title="No payments" body="No charge has succeeded or failed yet." /> : null}
      <ul className="space-y-3">
        {data?.payments.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded-card bg-surface p-4 shadow-soft">
            <span className="tabular-nums">{formatMoney(row.amount_cents, row.currency.toUpperCase())}</span>
            <StatusPill>{row.status.toLowerCase()}</StatusPill>
          </li>
        ))}
      </ul>
    </>
  );
}
