import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadAudit } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/audit")({ component: AuditPage });

function AuditPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadAudit>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAudit()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the audit log."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Audit log" body="Operator decisions are written here: listing review, fee changes, payouts, refunds, and verification." />
      {error ? <EmptyState title="Audit log didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No operator actions yet" body="Approving a listing, changing a fee, or marking a payout paid will show up here." /> : null}
      <ul className="space-y-2">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-card bg-surface p-4 text-sm shadow-soft">
            <p className="font-medium">{row.action}</p>
            <p className="text-muted">{row.actor} · {row.target}</p>
            <p className="text-xs text-muted">{row.created_at}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
