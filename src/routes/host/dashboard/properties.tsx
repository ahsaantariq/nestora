import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { deletePropertyFn, loadOwnerProperties, pausePropertyFn } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/host/dashboard/properties")({
  validateSearch: (search: Record<string, unknown>): { submitted?: 1 } => (
    search.submitted === 1 || search.submitted === "1" ? { submitted: 1 } : {}
  ),
  component: PropertiesPage,
});

const tone: Record<string, "muted" | "ok" | "warn" | "bad"> = {
  DRAFT: "muted",
  PENDING_REVIEW: "warn",
  LIVE: "ok",
  REJECTED: "bad",
  PAUSED: "muted",
};

function PropertiesPage() {
  const { submitted } = Route.useSearch();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadOwnerProperties>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  function reload() {
    return loadOwnerProperties().then(setRows);
  }

  useEffect(() => {
    let cancelled = false;
    loadOwnerProperties()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load properties."); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {confirm.dialog}
      {submitted ? (
        <p className="mb-4 rounded-[10px] border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          Your listing was submitted for review. We'll email you once it's approved.
        </p>
      ) : null}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageIntro title="Properties" body="Draft as many places as you need. A listing goes live only after it is approved." />
        <Link to="/host/dashboard/listing/$propertyId" params={{ propertyId: "new" }} className="inline-flex h-11 items-center rounded-[10px] bg-primary px-4 text-sm font-medium text-surface">
          Add property
        </Link>
      </div>
      {error ? <EmptyState title="Properties didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState title="No properties yet" body="Start with a hotel, house, apartment, or warehouse. You can keep it as a draft." />
      ) : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-card bg-surface p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link to="/host/dashboard/listing/$propertyId" params={{ propertyId: row.id }} className="font-medium hover:text-primary">{row.title}</Link>
                <p className="text-sm text-muted">{row.property_type.toLowerCase()} · {row.city || "No city yet"} · {formatMoney(row.nightly_cents)} / night</p>
                {row.rejection_reason ? <p className="mt-2 text-sm text-danger">{row.rejection_reason}</p> : null}
              </div>
              <StatusPill tone={tone[row.status] ?? "muted"}>{row.status.replaceAll("_", " ").toLowerCase()}</StatusPill>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {row.status === "DRAFT" || row.status === "REJECTED" ? (
                <Button
                  variant="danger"
                  onClick={() => confirm.ask("Delete this draft?", "This can't be undone.", async () => {
                    await deletePropertyFn({ data: { id: row.id } });
                    await reload();
                  })}
                >
                  Delete
                </Button>
              ) : null}
              {row.status === "LIVE" ? (
                <Button
                  variant="quiet"
                  onClick={() => confirm.ask("Pause this property?", "New guests won't be able to book it. Existing bookings stay on the calendar.", async () => {
                    await pausePropertyFn({ data: { id: row.id } });
                    await reload();
                  }, "Pause")}
                >
                  Pause
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
