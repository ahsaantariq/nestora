import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadStay } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PublicFrame } from "@/components/site-chrome";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/stay/$slug")({
  component: StayPage,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} · Nestora` },
      { name: "description", content: "A stay listed on Nestora." },
    ],
  }),
});

function StayPage() {
  const { slug } = Route.useParams();
  const [stay, setStay] = useState<Awaited<ReturnType<typeof loadStay>> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStay({ data: { slug } })
      .then((row) => {
        if (!cancelled) setStay(row);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this stay.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <PublicFrame>
      <div className="mx-auto max-w-3xl px-4 py-12">
        {stay === undefined && !error ? <Skeleton className="h-48" /> : null}
        {error ? <EmptyState title="This stay didn't load" body={error} /> : null}
        {stay === null ? (
          <EmptyState
            title="This stay isn't listed"
            body="It may be a draft, or it was never approved."
            action={<Link to="/search" className="text-sm font-medium text-primary">Back to search</Link>}
          />
        ) : null}
        {stay ? (
          <article>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{stay.propertyType.toLowerCase()}</p>
            <h1 className="mt-2 font-display text-5xl">{stay.title}</h1>
            <p className="mt-3 text-sm text-muted">{[stay.city, stay.region, stay.country].filter(Boolean).join(", ")}</p>
            <p className="mt-6 font-display text-3xl tabular-nums">{formatMoney(stay.nightlyCents)} <span className="text-base text-muted">/ night</span></p>
            <p className="mt-6 text-sm leading-relaxed">{stay.description || stay.summary || "The host hasn't written a description yet."}</p>
            <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">Guests</dt><dd className="font-medium tabular-nums">{stay.maxGuests}</dd></div>
              <div><dt className="text-muted">Bedrooms</dt><dd className="font-medium tabular-nums">{stay.bedrooms}</dd></div>
              <div><dt className="text-muted">Beds</dt><dd className="font-medium tabular-nums">{stay.beds}</dd></div>
              <div><dt className="text-muted">Baths</dt><dd className="font-medium tabular-nums">{stay.bathrooms}</dd></div>
            </dl>
            {stay.amenities.length > 0 ? (
              <ul className="mt-8 flex flex-wrap gap-2">
                {stay.amenities.map((amenity) => (
                  <li key={amenity} className="rounded-button bg-surface px-3 py-1.5 text-sm shadow-soft">{amenity}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-8 text-sm text-muted">No amenities listed.</p>
            )}
            <section className="mt-8">
              <h2 className="font-display text-2xl">House rules</h2>
              <p className="mt-2 text-sm text-muted">{stay.houseRules || "The host hasn't added house rules."}</p>
              <p className="mt-3 text-sm">Check-in {stay.checkInTime} · Check-out {stay.checkOutTime} · {stay.cancellationPolicy.toLowerCase()} cancellation · Pets {stay.petsAllowed ? "allowed" : "not allowed"}</p>
            </section>
          </article>
        ) : null}
      </div>
    </PublicFrame>
  );
}
