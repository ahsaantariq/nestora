import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PROPERTY_TYPES } from "@/lib/nestora/constants";
import { listFeatured, loadDestinations } from "@/lib/nestora/functions";
import type { StayCard } from "@/lib/nestora/data.server";
import { formatMoney } from "@/lib/domain/money";
import { PublicFrame } from "@/components/site-chrome";
import { SearchBar } from "@/components/search-bar";
import { EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [stays, setStays] = useState<StayCard[] | null>(null);
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof loadDestinations>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFeatured()
      .then((rows) => {
        if (!cancelled) setStays(rows);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load stays.");
      });
    loadDestinations()
      .then((rows) => { if (!cancelled) setPlaces(rows); })
      .catch(() => { if (!cancelled) setPlaces([]); });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicFrame>
      <section className="bg-primary text-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-14 lg:grid-cols-[1.3fr_0.7fr] lg:pb-28 lg:pt-20">
          <div>
            <p className="text-sm font-medium tracking-wide text-surface/80">A marketplace for real rooms</p>
            <h1 className="mt-3 max-w-xl font-display text-5xl leading-[1.05] sm:text-6xl">
              Find your stay.
            </h1>
            <p className="mt-4 max-w-md text-lg text-surface/85">
              List your space. Hotels, houses, apartments, and warehouses — with the price written out before you book.
            </p>
          </div>
          <ul className="hidden flex-col justify-end gap-4 text-sm lg:flex">
            <li className="border-t border-surface/20 pt-3">Four kinds of space, one calendar</li>
            <li className="border-t border-surface/20 pt-3">Hosts keep the rules. Guests see them first.</li>
            <li className="border-t border-surface/20 pt-3">What you pay is the nightly total, fees, and tax — nothing tucked away.</li>
          </ul>
        </div>
      </section>
      <div className="relative z-10 mx-auto -mt-12 max-w-6xl px-4">
        <SearchBar />
      </div>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">What kind of space</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROPERTY_TYPES.map((type, index) => (
            <Link
              key={type.id}
              to="/search"
              search={{ type: type.id }}
              className="rounded-card bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift"
            >
              <span className="font-display text-3xl text-primary">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="mt-8 font-display text-2xl">{type.label}</h3>
              <p className="mt-2 text-sm text-muted">{type.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">Live stays</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Approved stays you can book today.
        </p>
        <div className="mt-6">
          {stays == null && !error ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : null}
          {error ? <EmptyState title="Stays didn't load" body={error} /> : null}
          {stays && stays.length === 0 ? (
            <EmptyState
              title="No live stays yet"
              body="When a host lists a space and it is approved, it will show here with its real price and city."
              action={
                <Link to="/host" className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">
                  List your property
                </Link>
              }
            />
          ) : null}
          {stays && stays.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stays.map((stay) => (
                <Link key={stay.id} to="/stay/$slug" params={{ slug: stay.slug }} className="overflow-hidden rounded-card bg-surface shadow-soft">
                  {stay.coverUrl ? <img src={stay.coverUrl} alt="" className="h-40 w-full object-cover" /> : <div className="h-40 bg-primary/10" />}
                  <div className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">{stay.propertyType.toLowerCase()}</p>
                    <h3 className="mt-2 font-display text-2xl">{stay.title}</h3>
                    <p className="mt-2 text-sm text-muted">{[stay.city, stay.region, stay.country].filter(Boolean).join(", ")}</p>
                    <p className="mt-4 text-sm font-medium tabular-nums">{formatMoney(stay.nightlyCents)} / night</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">Places with a live stay</h2>
        {places && places.length === 0 ? (
          <p className="mt-3 max-w-xl text-sm text-muted">Cities appear here once a stay in that city is live.</p>
        ) : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {places?.map((place) => (
            <Link key={`${place.city}-${place.country}`} to="/search" search={{ location: place.city }} className="rounded-card bg-surface p-5 shadow-soft">
              <h3 className="font-display text-2xl">{place.city}</h3>
              <p className="mt-1 text-sm text-muted">{place.country} · {place.stays} {place.stays === 1 ? "stay" : "stays"}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl gap-6 px-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-card bg-primary p-8 text-surface">
          <h2 className="font-display text-4xl">List your space</h2>
          <p className="mt-3 max-w-md text-surface/85">Draft the place, the price, and the rules. Nestora reviews it before guests can book.</p>
          <Link to="/host" className="mt-6 inline-flex h-11 items-center rounded-button bg-surface px-4 text-sm font-medium text-primary">List your property</Link>
        </div>
        <div className="space-y-4">
          {[
            ["Approved before it is public", "A listing stays a draft until Nestora approves it."],
            ["The price is the price", "Nightly total, fees, and tax are shown before anyone pays."],
            ["Cards stay with the card network", "Nestora never stores a card number."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-card bg-surface p-5 shadow-soft">
              <h3 className="font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">Questions</h2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Who can list a property?", "Anyone can create a host account. Listings go live after Nestora reviews them."],
            ["When can I review a stay?", "After that booking is completed. The host can reply, and Nestora can remove a review."],
            ["What if I cancel?", "The stay's policy (Flexible, Moderate, or Strict) decides the refund before you confirm."],
            ["Where do photos go?", "Upload them from your computer while you edit a listing. A 3D tour can still be a link."],
          ].map(([question, answer]) => (
            <div key={question} className="border-t border-line pt-4">
              <dt className="font-medium">{question}</dt>
              <dd className="mt-2 text-sm text-muted">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl gap-6 px-4 md:grid-cols-3">
        {[
          ["01", "Say where and when", "City, dates, adults, children, infants, and whether a pet is coming."],
          ["02", "Read the stay", "House rules, cancellation, and a price that adds the fees before you commit."],
          ["03", "Or list one", "Hosts draft a space. Nestora approves it before anyone can book."],
        ].map(([step, title, body]) => (
          <article key={step} className="border-t border-line pt-4">
            <p className="font-display text-2xl text-accent">{step}</p>
            <h2 className="mt-3 font-display text-2xl">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </article>
        ))}
      </section>
    </PublicFrame>
  );
}
