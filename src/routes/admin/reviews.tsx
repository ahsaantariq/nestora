import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminDeleteReviewFn, loadReviewsFn } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/reviews")({ component: ReviewsAdmin });

function ReviewsAdmin() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadReviewsFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  function reload() {
    return loadReviewsFn().then(setRows);
  }
  useEffect(() => {
    reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load reviews."));
  }, []);
  return (
    <>
      {confirm.dialog}
      <PageIntro title="Reviews" body="Remove a review that shouldn't stay on a listing. The removal is written to the audit log." />
      {error ? <EmptyState title="Reviews didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No reviews" body="Reviews show up after a completed stay." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-card bg-white p-4 shadow-soft">
            <p className="font-medium">{row.title} · {row.rating}/5</p>
            <p className="text-sm text-muted">{row.author}</p>
            <p className="mt-2 text-sm">{row.body}</p>
            <Button className="mt-3" variant="danger" onClick={() => confirm.ask("Delete this review?", "This can't be undone.", async () => {
              await adminDeleteReviewFn({ data: { id: row.id } });
              await reload();
            })}>Delete</Button>
          </li>
        ))}
      </ul>
    </>
  );
}
