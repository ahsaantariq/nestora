import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { assistantAnalyticsFn, listCallsFn } from "@/lib/nestora/assistant.fns";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/calls")({ component: CallsPage });

function CallsPage() {
  const [calls, setCalls] = useState<Awaited<ReturnType<typeof listCallsFn>> | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof assistantAnalyticsFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([listCallsFn(), assistantAnalyticsFn()])
      .then(([nextCalls, nextStats]) => { setCalls(nextCalls); setStats(nextStats); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load calls."));
  }, []);
  if (error) return <EmptyState title="Calls didn't load" body={error} />;
  if (!calls || !stats) return <Skeleton className="h-32" />;
  const totals = stats.totals;
  return (
    <>
      <PageIntro title="Calls and assistant results" body="Recordings stay for the retention period you set, then the audio and transcript are cleared." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Conversations", String(totals.conversations)],
          ["Avg reply", totals.responseSeconds ? `${totals.responseSeconds}s` : "—"],
          ["AI resolved", String(totals.aiResolved)],
          ["Handed off", String(totals.handed)],
          ["Booked", String(totals.booked)],
          ["AI revenue", formatMoney(totals.revenue)],
          ["AI cost this month", formatMoney(totals.cost)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-card bg-white p-4 shadow-soft">
            <p className="text-xs uppercase text-muted">{label}</p>
            <p className="mt-2 font-display text-2xl">{value}</p>
          </article>
        ))}
      </div>
      <ul className="mb-6 flex flex-wrap gap-2 text-sm">
        {stats.byChannel.map((row) => <li key={row.channel} className="rounded-button bg-white px-3 py-2 shadow-soft">{row.channel}: {row.n}</li>)}
      </ul>
      {calls.length === 0 ? <EmptyState title="No calls yet" body="Inbound calls appear after Twilio is connected and the voice service is running." /> : null}
      <ul className="space-y-3">
        {calls.map((call) => (
          <li key={String(call.id)} className="rounded-card bg-white p-4 shadow-soft">
            <p className="text-sm">{call.direction} · {call.from_number || ""} → {call.to_number || ""} · {call.duration_seconds}s · {call.outcome === "open" ? "not booked" : call.outcome.replaceAll("_", " ")}</p>
            {call.recording_url ? <audio className="mt-2 w-full" controls src={String(call.recording_url)} /> : <p className="mt-2 text-sm text-muted">No recording stored.</p>}
            {call.summary ? <p className="mt-2 text-sm">{String(call.summary)}</p> : null}
            {call.transcript ? <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{String(call.transcript)}</pre> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
