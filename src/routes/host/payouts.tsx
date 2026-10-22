import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadPayouts } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/host/payouts")({ component: PayoutsPage });

function PayoutsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPayouts>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPayouts()
      .then((next) => { if (!cancelled) setData(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load payouts."); });
    return () => { cancelled = true; };
  }, []);
  const pending = data?.payouts.filter((row) => row.status === "PENDING").reduce((sum, row) => sum + row.amount_cents, 0) ?? 0;
  return (
    <>
      <PageIntro title="Payouts" body="Bank details stay on your account. Nestora marks a payout paid with a bank reference — it does not invent transfers." />
      {error ? <EmptyState title="Payouts didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-24" /> : null}
      {data ? (
        <div className="space-y-4">
          <div className="rounded-card bg-surface p-5 shadow-soft">
            <p className="text-sm text-muted">Pending balance</p>
            <p className="mt-1 font-display text-3xl tabular-nums">{formatMoney(pending)}</p>
            <p className="mt-4 text-sm">
              {data.account
                ? `${data.account.account_name} · ${data.account.bank_name} · ${mask(data.account.account_number)}`
                : "No bank account on file yet."}
            </p>
          </div>
          {data.payouts.length === 0 ? <EmptyState title="No payouts" body="Nothing has been queued or paid." /> : null}
          <ul className="space-y-3">
            {data.payouts.map((row) => (
              <li key={row.id} className="flex items-center justify-between rounded-card bg-surface p-4 shadow-soft">
                <span className="tabular-nums">{formatMoney(row.amount_cents)}</span>
                <StatusPill>{row.status.toLowerCase()}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function mask(value: string) {
  const tail = value.slice(-4);
  return `•••• ${tail}`;
}
