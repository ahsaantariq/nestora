import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { deleteSavedFn, loadSavedStays } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/dashboard/saved")({ component: SavedPage });

function SavedPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadSavedStays>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  function reload() {
    return loadSavedStays().then(setRows);
  }
  useEffect(() => {
    let cancelled = false;
    loadSavedStays()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load saved stays."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      {confirm.dialog}
      <PageIntro title="Saved properties" body="Stays you mark are kept on your account." />
      {error ? <EmptyState title="Saved stays didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState title="Nothing saved" body="There are no saved stays on this account." action={<Link to="/search" className="text-sm font-medium text-primary">Browse stays</Link>} />
      ) : null}
      <ul className="space-y-3">
        {rows?.map((stay) => (
          <li key={stay.id} className="flex items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
            <Link to="/stay/$slug" params={{ slug: stay.slug }} className="min-w-0">
              <p className="font-medium">{stay.title}</p>
              <p className="text-sm text-muted">{stay.city} · {formatMoney(stay.nightlyCents)} / night</p>
            </Link>
            <Button variant="danger" onClick={() => confirm.ask("Remove this saved stay?", "You can save it again from the listing.", async () => {
              await deleteSavedFn({ data: { propertyId: stay.id } });
              await reload();
            })}>Delete</Button>
          </li>
        ))}
      </ul>
    </>
  );
}
