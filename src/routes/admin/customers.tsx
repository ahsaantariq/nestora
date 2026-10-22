import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadPeople } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/customers")({ component: CustomersPage });

function CustomersPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPeople>> | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      <PageIntro title="Customers" body="Guest accounts. Emails are visible here because you operate the marketplace." />
      {error ? <EmptyState title="Guests didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && guests.length === 0 ? <EmptyState title="No guest accounts" body="Accounts that aren't hosts or operators will be listed here." /> : null}
      <ul className="space-y-3">
        {guests.map((person) => (
          <li key={person.userId} className="rounded-card bg-surface p-4 shadow-soft">
            <p className="font-medium">{person.displayName}</p>
            <p className="text-sm text-muted">{person.email}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
