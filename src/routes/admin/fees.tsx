import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSettings } from "@/lib/nestora/functions";
import { SettingsList } from "@/routes/host/fees";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/fees")({ component: AdminFees });

function AdminFees() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadSettings>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((next) => { if (!cancelled) setData(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load settings."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Fees and settings" body="These are the live defaults: subscription, commission, managed-property fees, tax, service fee, and the three cancellation policies. Editing them is the next operator tool. Both commission and subscription can be on, one on, or both off." />
      {error ? <EmptyState title="Settings didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-40" /> : null}
      {data ? <SettingsList settings={data} /> : null}
    </>
  );
}
