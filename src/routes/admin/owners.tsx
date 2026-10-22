import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminDeleteUserFn, decideAccount, loadPeople, setPropertyCapFn } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill, TextInput } from "@/components/ui";

export const Route = createFileRoute("/admin/owners")({ component: OwnersPage });

function OwnersPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPeople>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [caps, setCaps] = useState<Record<string, string>>({});
  const confirm = useConfirm();

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
      {confirm.dialog}
      <PageIntro title="Owners" body="Approve a request and that account can list properties. There is no property limit unless you set one." />
      {error ? <EmptyState title="People didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-28" /> : null}
      {rows && hosts.length === 0 ? <EmptyState title="No hosts yet" body="When someone creates a host account, they show up here." /> : null}
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
                  <Button type="button" loading={busy === person.userId + "APPROVE"} onClick={() => void act(person.userId, "APPROVE")}>Approve</Button>
                  <Button type="button" variant="quiet" loading={busy === person.userId + "REJECT"} onClick={() => void act(person.userId, "REJECT")}>Reject</Button>
                </>
              ) : null}
              {person.accountStatus === "ACTIVE" ? (
                <Button type="button" variant="danger" loading={busy === person.userId + "SUSPEND"} onClick={() => void act(person.userId, "SUSPEND")}>Suspend</Button>
              ) : (
                <Button type="button" variant="quiet" loading={busy === person.userId + "RESTORE"} onClick={() => void act(person.userId, "RESTORE")}>Restore</Button>
              )}
              {person.role !== "ADMIN" ? (
                <Button type="button" variant="danger" onClick={() => confirm.ask("Remove this account?", "If they have bookings, the account is deactivated instead of deleted.", async () => {
                  await adminDeleteUserFn({ data: { userId: person.userId } });
                  await refresh();
                })}>Delete</Button>
              ) : null}
            </div>
            {person.role === "OWNER" ? (
              <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => {
                event.preventDefault();
                const raw = (caps[person.userId] ?? (person.maxProperties == null ? "" : String(person.maxProperties))).trim();
                setBusy(person.userId + "CAP");
                setPropertyCapFn({ data: { userId: person.userId, maxProperties: raw === "" ? null : Number(raw) } })
                  .then(() => refresh())
                  .catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : "Could not save the limit."))
                  .finally(() => setBusy(null));
              }}>
                <label className="text-sm">Property limit
                  <TextInput className="mt-1 w-32" inputMode="numeric" placeholder="None" value={caps[person.userId] ?? (person.maxProperties == null ? "" : String(person.maxProperties))} onChange={(event) => setCaps((current) => ({ ...current, [person.userId]: event.target.value }))} />
                </label>
                <Button type="submit" variant="quiet" loading={busy === person.userId + "CAP"} loadingLabel="Saving...">Save limit</Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
