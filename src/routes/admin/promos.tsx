import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminDeletePromoFn, loadPromosFn, savePromoFn } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { AsyncForm, TextField, useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/promos")({ component: PromosPage });

function PromosPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPromosFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const confirm = useConfirm();

  function reload() {
    return loadPromosFn().then(setRows);
  }

  useEffect(() => {
    reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load promo codes."));
  }, []);

  return (
    <>
      {confirm.dialog}
      <PageIntro title="Promo codes" body="A code is either a percent off or left unused. Deleting a code is recorded in the audit log." />
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <AsyncForm
        className="mb-6 grid gap-4 rounded-card bg-white p-5 shadow-soft md:grid-cols-3"
        onSubmit={async () => {
          setError(null);
          const next = await savePromoFn({ data: { code, percent: percent.trim() ? Math.round(Number(percent) * 100) : null, amountCents: null } });
          setRows(next);
          setCode("");
          setPercent("");
        }}
      >
        {(busy) => (
          <>
            <TextField label="Code" value={code} onChange={setCode} required />
            <TextField label="Percent off" value={percent} onChange={setPercent} hint="For example 10 for 10%." />
            <div className="flex items-end"><Button type="submit" loading={busy} loadingLabel="Saving...">Add code</Button></div>
          </>
        )}
      </AsyncForm>
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No promo codes" body="Add one above when you want a discount guests can type at checkout." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.code} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-white p-4 shadow-soft">
            <div>
              <p className="font-medium">{row.code}</p>
              <p className="text-sm text-muted">{row.percent_bps != null ? `${row.percent_bps / 100}% off` : "Fixed amount"} · used {row.used_count}</p>
            </div>
            <Button variant="danger" onClick={() => confirm.ask("Delete this promo code?", "Guests will no longer be able to use it.", async () => {
              await adminDeletePromoFn({ data: { code: row.code } });
              await reload();
            })}>Delete</Button>
          </li>
        ))}
      </ul>
    </>
  );
}
