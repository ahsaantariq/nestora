import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cancelTrip, previewCancel, publishReview } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PublicFrame } from "@/components/site-chrome";
import { Button, EmptyState, Skeleton, TextArea } from "@/components/ui";

export const Route = createFileRoute("/trips/$bookingId")({ component: TripPage });

function TripPage() {
  const { bookingId } = Route.useParams();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewCancel>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    previewCancel({ data: { bookingId } })
      .then((row) => { if (!cancelled) setPreview(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open this trip."); });
    return () => { cancelled = true; };
  }, [bookingId]);

  return (
    <PublicFrame>
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-display text-4xl">Your trip</h1>
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        {!preview && !error ? <Skeleton className="mt-6 h-32" /> : null}
        {preview ? (
          <div className="mt-6 space-y-4 rounded-card bg-surface p-5 shadow-soft print:shadow-none">
            <p className="text-sm text-muted">Status · {preview.status.toLowerCase()}</p>
            <p className="text-sm">Policy · {preview.policy.toLowerCase()}</p>
            <p className="text-sm">If you cancel now, the refund to the original card would be {formatMoney(preview.refundCents)}. {formatMoney(preview.retainedCents)} would be kept.</p>
            {done ? <p className="text-sm">{done}</p> : null}
            {preview.status === "CONFIRMED" || preview.status === "PENDING" ? (
              <Button variant="danger" onClick={() => {
                cancelTrip({ data: { bookingId } })
                  .then((result) => setDone(`Cancelled. Refund status: ${"refundStatus" in result ? result.refundStatus : "see email"}.`))
                  .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not cancel."));
              }}>Cancel booking</Button>
            ) : null}
            {preview.status === "COMPLETED" ? (
              <form className="space-y-3" onSubmit={(event) => {
                event.preventDefault();
                publishReview({ data: { bookingId, rating, body } })
                  .then(() => setDone("Review saved."))
                  .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not save the review."));
              }}>
                <label className="block text-sm">Rating
                  <input className="mt-1 h-11 w-full rounded-button border border-line px-3" type="number" min={1} max={5} value={rating} onChange={(event) => setRating(Number(event.target.value))} />
                </label>
                <TextArea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What should the next guest know?" />
                <Button type="submit">Publish review</Button>
              </form>
            ) : <p className="text-sm text-muted">Reviews open after the stay is marked completed.</p>}
            <p className="text-xs text-muted">Print this page to keep a receipt. Card numbers are not on it.</p>
            <Link to="/dashboard/bookings" className="text-sm text-primary">All bookings</Link>
          </div>
        ) : null}
        {!preview && error ? <div className="mt-6"><EmptyState title="Trip unavailable" body={error} /></div> : null}
      </div>
    </PublicFrame>
  );
}
