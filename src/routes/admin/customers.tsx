import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminDeleteUserFn, loadPeople } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/customers")({ component: CustomersPage });

function CustomersPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPeople>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  function reload() {
    return loadPeople().then(setRows);
  }
  useEffect(() => {
    let cancelled = false;
    loadPeople()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load guests."); });
    return () => { cancelled = true; };
  }, []);
  const guests = (rows ?? []).filter((row) => row.role === "CUSTOMER");
  return (
    <>
      {confirm.dialog}
      <PageIntro title="Customers" body="Guest accounts. Someone with bookings is deactivated instead of erased." />
      {error ? <EmptyState title="Guests didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && guests.length === 0 ? <EmptyState title="No guest accounts" body="People who sign up to book stays will be listed here." /> : null}
      <ul className="space-y-3">
        {guests.map((person) => (
          <li key={person.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
            <div>
              <p className="font-medium">{person.displayName}</p>
              <p className="text-sm text-muted">{person.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {person.accountStatus !== "ACTIVE" ? <StatusPill tone="bad">{person.accountStatus.toLowerCase()}</StatusPill> : null}
              <Button variant="danger" onClick={() => confirm.ask("Remove this guest?", "If they have bookings, the account is deactivated instead of deleted.", async () => {
                await adminDeleteUserFn({ data: { userId: person.userId } });
                await reload();
              })}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
