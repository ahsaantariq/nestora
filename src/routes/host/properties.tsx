import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadOwnerProperties } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/host/properties")({ component: PropertiesPage });

const tone: Record<string, "muted" | "ok" | "warn" | "bad"> = {
  DRAFT: "muted",
  PENDING_REVIEW: "warn",
  LIVE: "ok",
  REJECTED: "bad",
  PAUSED: "muted",
};

function PropertiesPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadOwnerProperties>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadOwnerProperties()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load properties."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Properties" body="Drafts stay private until you send them for review. An operator has to approve a listing before anyone can book it." />
      {error ? <EmptyState title="Properties didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState title="No properties yet" body="You haven't saved a hotel, house, apartment, or warehouse. Nothing is filled in for you." action={<Link to="/host/listing/$propertyId" params={{ propertyId: "new" }} className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">New listing</Link>} />
      ) : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-card bg-surface p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link to="/host/listing/$propertyId" params={{ propertyId: row.id }} className="font-medium hover:text-primary">{row.title}</Link>
                <p className="text-sm text-muted">{row.property_type.toLowerCase()} · {row.city || "No city yet"} · {formatMoney(row.nightly_cents)} / night</p>
                {row.rejection_reason ? <p className="mt-2 text-sm text-danger">{row.rejection_reason}</p> : null}
              </div>
              <StatusPill tone={tone[row.status] ?? "muted"}>{row.status.replaceAll("_", " ").toLowerCase()}</StatusPill>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
