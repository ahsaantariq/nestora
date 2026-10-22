import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSettings } from "@/lib/nestora/functions";
import { formatBps, formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/host/dashboard/fees")({ component: FeesPage });

function FeesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadSettings>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((next) => { if (!cancelled) setData(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load fees."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Subscription and fees" body="What guests and hosts are charged today. These numbers come from Nestora's current settings." />
      {error ? <EmptyState title="Fees didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-40" /> : null}
      {data ? <SettingsList settings={data} /> : null}
    </>
  );
}

export function SettingsList({ settings }: { settings: Awaited<ReturnType<typeof loadSettings>> }) {
  const commission = !settings.commissionEnabled
    ? "Off"
    : settings.commissionType === "FIXED"
      ? formatMoney(settings.commissionFixedCents)
      : formatBps(settings.commissionBps);
  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-2">
        <Row label="Monthly subscription" value={settings.subscriptionEnabled ? formatMoney(settings.subscriptionAmountCents) : "Off"} />
        <Row label="Commission" value={commission} />
        <Row label="Managed cleaning" value={formatMoney(settings.managedCleaningFeeCents)} />
        <Row label="Management fee" value={formatBps(settings.managedManagementBps)} />
        <Row label="Linen and laundry" value={formatMoney(settings.managedLinenFeeCents)} />
        <Row label="Maintenance reserve" value={formatMoney(settings.managedMaintenanceCents)} />
        <Row label="Tax" value={formatBps(settings.taxBps)} />
        <Row label="Service fee" value={formatBps(settings.serviceFeeBps)} />
      </dl>
      <div>
        <h2 className="font-display text-2xl">Cancellation</h2>
        <ul className="mt-3 space-y-3">
          {settings.policies.map((policy) => (
            <li key={policy.code} className="rounded-card bg-surface p-4 shadow-soft">
              <p className="font-medium">{policy.name}</p>
              <p className="mt-1 text-sm text-muted">{policy.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-soft">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
