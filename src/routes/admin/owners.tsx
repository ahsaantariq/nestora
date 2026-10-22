import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { decideAccount, loadPeople } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/owners")({ component: OwnersPage });

function OwnersPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPeople>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function refresh() {
    return loadPeople().then(setRows);
  }

  useEffect(() => {
    let cancelled = false;
    loadPeople()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load people."); });
    return () => { cancelled = true; };
  }, []);

  async function act(userId: string, decision: "APPROVE" | "REJECT" | "SUSPEND" | "RESTORE") {
    const note = decision === "REJECT" ? window.prompt("Reason for the host? (optional)") ?? "" : "";
    setBusy(userId + decision);
    try {
      await decideAccount({ data: { userId, decision, note } });
      await refresh();
      toast.success("Updated.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not update.");
    } finally {
      setBusy(null);
    }
  }

  const hosts = (rows ?? []).filter((row) => row.role === "OWNER" || row.ownerStatus !== "NONE" || row.role === "ADMIN");
  return (
    <>
      <PageIntro title="Owners" body="Approve a request and that account becomes a host. Suspend closes their desks without deleting bookings." />
      {error ? <EmptyState title="People didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-28" /> : null}
      {rows && hosts.length === 0 ? <EmptyState title="No host requests" body="When a guest asks to list a space, they show up here." /> : null}
      <ul className="space-y-3">
        {hosts.map((person) => (
          <li key={person.userId} className="rounded-card bg-surface p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{person.displayName}</p>
                <p className="text-sm text-muted">{person.email}</p>
                {person.ownerNote ? <p className="mt-2 text-sm">{person.ownerNote}</p> : null}
              </div>
              <div className="flex gap-2">
                <StatusPill>{person.role.toLowerCase()}</StatusPill>
                <StatusPill tone={person.ownerStatus === "PENDING" ? "warn" : "muted"}>{person.ownerStatus.toLowerCase()}</StatusPill>
                {person.accountStatus === "SUSPENDED" ? <StatusPill tone="bad">suspended</StatusPill> : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {person.ownerStatus === "PENDING" ? (
                <>
                  <Button type="button" disabled={busy !== null} onClick={() => void act(person.userId, "APPROVE")}>Approve</Button>
                  <Button type="button" variant="quiet" disabled={busy !== null} onClick={() => void act(person.userId, "REJECT")}>Reject</Button>
                </>
              ) : null}
              {person.accountStatus === "ACTIVE" ? (
                <Button type="button" variant="danger" disabled={busy !== null} onClick={() => void act(person.userId, "SUSPEND")}>Suspend</Button>
              ) : (
                <Button type="button" variant="quiet" disabled={busy !== null} onClick={() => void act(person.userId, "RESTORE")}>Restore</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
