import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadEmailLogFn } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/email")({ component: EmailLogPage });

function EmailLogPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadEmailLogFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadEmailLogFn()
      .then(setRows)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the email log."));
  }, []);
  return (
    <>
      <PageIntro title="Email log" body="Verification, booking, and other mail. Failed messages are retried." />
      {error ? <EmptyState title="Email log didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No messages yet" body="Mail appears here after someone signs up or books." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-card bg-white p-4 text-sm shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{row.subject || row.template}</p>
              <StatusPill tone={row.status === "FAILED" ? "bad" : row.status === "SENT" ? "ok" : "warn"}>{row.status.toLowerCase()}</StatusPill>
            </div>
            <p className="mt-1 text-muted">{row.to_address} · {row.template} · tries {row.attempts}</p>
            {row.error ? <p className="mt-2 text-danger">{row.error}</p> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
