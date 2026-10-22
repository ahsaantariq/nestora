import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSettings, saveFees } from "@/lib/nestora/functions";
import { SettingsList } from "@/routes/host/dashboard/fees";
import { PageIntro } from "@/components/workspace";
import { Button, EmptyState, Skeleton, TextInput } from "@/components/ui";

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
      <PageIntro title="Fees and settings" body="Commission, subscription, management fee, tax, and service fee. Changes are written to the live settings row and the audit log. Both commission and subscription can be on, one on, or both off." />
      {error ? <EmptyState title="Settings didn't load" body={error} /> : null}
      {!data && !error ? <Skeleton className="h-40" /> : null}
      {data ? (
        <>
          <SettingsList settings={data} />
          <FeeEditor initial={data} onSaved={setData} onError={setError} />
        </>
      ) : null}
    </>
  );
}

function FeeEditor({
  initial,
  onSaved,
  onError,
}: {
  initial: Awaited<ReturnType<typeof loadSettings>>;
  onSaved: (next: Awaited<ReturnType<typeof loadSettings>>) => void;
  onError: (message: string) => void;
}) {
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(initial.subscriptionEnabled);
  const [subscription, setSubscription] = useState((initial.subscriptionAmountCents / 100).toFixed(2));
  const [commissionEnabled, setCommissionEnabled] = useState(initial.commissionEnabled);
  const [commission, setCommission] = useState(String(initial.commissionBps / 100));
  const [managed, setManaged] = useState(String(initial.managedManagementBps / 100));
  const [tax, setTax] = useState(String(initial.taxBps / 100));
  const [service, setService] = useState(String(initial.serviceFeeBps / 100));
  const [saving, setSaving] = useState(false);
  return (
    <form className="mt-8 grid gap-3 rounded-card bg-surface p-5 shadow-soft sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      setSaving(true);
      saveFees({
        data: {
          subscriptionEnabled,
          subscriptionAmountCents: Math.round(Number(subscription) * 100) || 0,
          commissionEnabled,
          commissionBps: Math.round(Number(commission) * 100) || 0,
          managedManagementBps: Math.round(Number(managed) * 100) || 0,
          taxBps: Math.round(Number(tax) * 100) || 0,
          serviceFeeBps: Math.round(Number(service) * 100) || 0,
        },
      }).then(onSaved).catch((reason: unknown) => onError(reason instanceof Error ? reason.message : "Could not save settings.")).finally(() => setSaving(false));
    }}>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={subscriptionEnabled} onChange={(event) => setSubscriptionEnabled(event.target.checked)} /> Monthly subscription</label>
      <label className="text-sm">Amount<TextInput className="mt-1" value={subscription} onChange={(event) => setSubscription(event.target.value)} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={commissionEnabled} onChange={(event) => setCommissionEnabled(event.target.checked)} /> Commission on</label>
      <label className="text-sm">Commission %<TextInput className="mt-1" value={commission} onChange={(event) => setCommission(event.target.value)} /></label>
      <label className="text-sm">Management %<TextInput className="mt-1" value={managed} onChange={(event) => setManaged(event.target.value)} /></label>
      <label className="text-sm">Tax %<TextInput className="mt-1" value={tax} onChange={(event) => setTax(event.target.value)} /></label>
      <label className="text-sm">Service fee %<TextInput className="mt-1" value={service} onChange={(event) => setService(event.target.value)} /></label>
      <Button type="submit" loading={saving} loadingLabel="Saving...">Save settings</Button>
    </form>
  );
}
