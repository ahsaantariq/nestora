import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { deleteCardFn, loadSavedCards } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/dashboard/cards")({ component: CardsPage });

function CardsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadSavedCards>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  function reload() {
    return loadSavedCards().then(setRows);
  }
  useEffect(() => {
    let cancelled = false;
    loadSavedCards()
      .then((next) => { if (!cancelled) setRows(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load cards."); });
    return () => { cancelled = true; };
  }, []);
  return (
    <>
      {confirm.dialog}
      <PageIntro title="Saved cards" body="Nestora stores the brand and last four digits. The full card number stays with the card network." />
      {error ? <EmptyState title="Cards didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState title="No cards on file" body="When you pay for a stay, you can save a card and choose it next time." />
      ) : null}
      <ul className="space-y-3">
        {rows?.map((card) => (
          <li key={card.id} className="flex items-center justify-between rounded-card bg-surface p-4 shadow-soft">
            <div>
              <p className="font-medium capitalize">{card.brand} ···· {card.last4}</p>
              <p className="text-sm text-muted tabular-nums">{card.exp_month}/{card.exp_year}</p>
            </div>
            <div className="flex items-center gap-3">
              {card.is_default ? <span className="text-xs font-medium text-primary">Default</span> : null}
              <Button variant="danger" onClick={() => confirm.ask("Remove this card?", "It won't be offered at checkout anymore.", async () => {
                await deleteCardFn({ data: { cardId: card.id } });
                await reload();
              })}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
