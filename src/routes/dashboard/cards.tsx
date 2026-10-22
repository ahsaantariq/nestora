import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSavedCards } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/dashboard/cards")({ component: CardsPage });

function CardsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadSavedCards>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSavedCards()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load cards."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      <PageIntro title="Saved cards" body="Nestora stores the brand and last four digits. The full card number stays with Stripe." />
      {error ? <EmptyState title="Cards didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState title="No cards on file" body="When checkout is connected, you can save a card here and choose it next time. Nothing is stored until then." />
      ) : null}
      <ul className="space-y-3">
        {rows?.map((card) => (
          <li key={card.id} className="flex items-center justify-between rounded-card bg-surface p-4 shadow-soft">
            <div>
              <p className="font-medium capitalize">{card.brand} ···· {card.last4}</p>
              <p className="text-sm text-muted tabular-nums">{card.exp_month}/{card.exp_year}</p>
            </div>
            {card.is_default ? <span className="text-xs font-medium text-primary">Default</span> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
