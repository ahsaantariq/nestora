import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadHealth } from "@/lib/nestora/functions";
import { PublicFrame } from "@/components/site-chrome";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/status")({ component: StatusPage });

function StatusPage() {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof loadHealth>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadHealth()
      .then((row) => { if (!cancelled) setHealth(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Health check failed."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <PublicFrame>
      <div className="mx-auto max-w-xl px-4 py-14">
        <h1 className="font-display text-4xl">Database status</h1>
        <p className="mt-2 text-sm text-muted">This is the same check as /api/health. It does not show passwords or connection strings.</p>
        {error ? <div className="mt-6"><EmptyState title="Check failed" body={error} /></div> : null}
        {!health && !error ? <Skeleton className="mt-6 h-40" /> : null}
        {health ? (
          <dl className="mt-6 space-y-3 rounded-card bg-surface p-5 shadow-soft text-sm">
            <Row label="Database connected" value={health.databaseConnected ? "yes" : "no"} />
            <Row label="Driver" value={health.driver === "pglite" ? "embedded preview database" : "PostgreSQL"} />
            <Row label="Tables found" value={health.tables == null ? "unknown" : String(health.tables)} />
            <Row label="Schema connection" value={health.migrationTarget} />
            {health.error ? <Row label="Error" value={health.error} /> : null}
            {health.fix ? <Row label="Fix" value={health.fix} /> : null}
          </dl>
        ) : null}
      </div>
    </PublicFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
