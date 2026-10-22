import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadAdminTables, payHost } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { Button, EmptyState, Skeleton, StatusPill, TextInput } from "@/components/ui";

export const Route = createFileRoute("/admin/payouts")({ component: AdminPayouts });

function AdminPayouts() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAdminTables>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  function reload() {
    loadAdminTables().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load payouts."));
  }
  useEffect(() => {
    reload();
  }, []);
  const owed = data?.payouts.filter((row) => row.status === "PENDING").reduce((sum, row) => sum + row.amount_cents, 0) ?? 0;
  return (
    <>
      <PageIntro title="Payouts" body="Amounts owed to hosts. Marking one paid records the bank reference and the date." />
      {error ? <EmptyState title="Payouts didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-24" /> : null}
      {data ? <p className="mb-4 text-sm text-muted">Pending total {formatMoney(owed)}</p> : null}
      {data && data.payouts.length === 0 ? <EmptyState title="Nothing owed" body="No payout rows exist." /> : null}
      <ul className="space-y-3">
        {data?.payouts.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
            <span className="tabular-nums">{formatMoney(row.amount_cents)}</span>
            <StatusPill>{row.status.toLowerCase()}</StatusPill>
            {row.status === "PENDING" ? (
              <form className="flex gap-2" onSubmit={(event) => {
                event.preventDefault();
                setPaying(row.id);
                payHost({ data: { payoutId: row.id, bankReference: reference } })
                  .then(reload)
                  .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not mark that paid."))
                  .finally(() => setPaying(null));
              }}>
                <TextInput value={reference} placeholder="Bank reference" onChange={(event) => setReference(event.target.value)} />
                <Button type="submit" loading={paying === row.id} loadingLabel="Saving...">Mark paid</Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
