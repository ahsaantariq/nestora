import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { deleteRoomFn, loadOwnerRoomsFn } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/host/dashboard/rooms")({ component: RoomsPage });

function RoomsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadOwnerRoomsFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  function reload() {
    return loadOwnerRoomsFn().then(setRows);
  }

  useEffect(() => {
    let cancelled = false;
    loadOwnerRoomsFn()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load rooms."); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {confirm.dialog}
      <PageIntro title="Rooms and units" body="Hotel room types are edited inside that listing. Draft rooms can be removed here." />
      {error ? <EmptyState title="Rooms didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState title="No room types" body="Add room types while editing a hotel listing. Whole homes don't need them." />
      ) : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-sm text-muted">{row.property_title} · {formatMoney(row.nightly_cents)} / night</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill>{row.status.replaceAll("_", " ").toLowerCase()}</StatusPill>
              {row.status === "DRAFT" || row.status === "REJECTED" ? (
                <Button
                  variant="danger"
                  onClick={() => confirm.ask("Delete this draft room?", "This can't be undone.", async () => {
                    await deleteRoomFn({ data: { id: row.id } });
                    await reload();
                  })}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
