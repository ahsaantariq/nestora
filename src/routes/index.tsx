import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PROPERTY_TYPES } from "@/lib/nestora/constants";
import { loadMarketplaceFn, subscribeNewsletterFn } from "@/lib/nestora/content.fns";
import { PublicFrame } from "@/components/site-chrome";
import { SearchBar } from "@/components/search-bar";
import { StayCardView } from "@/components/stay-card";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/")({ component: Home });

type HomeData = Awaited<ReturnType<typeof loadMarketplaceFn>>;

function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [news, setNews] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMarketplaceFn()
      .then((next) => { if (!cancelled) setData(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the home page."); });
    return () => { cancelled = true; };
  }, []);

  const counts = new Map((data?.counts ?? []).map((row) => [row.property_type, row.n]));
  const stats = data?.stats;
  const showStats = Boolean(stats && stats.stays > 0);

  return (
    <PublicFrame>
      <section className="bg-primary text-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 pt-16 lg:grid-cols-[1.2fr_0.8fr] lg:pt-20">
          <div>
            <p className="text-sm font-medium tracking-wide text-surface/80">Reviewed listings. The price before you pay.</p>
            <h1 className="mt-3 max-w-xl font-display text-5xl leading-[1.05] sm:text-6xl">Find a place that is actually listed.</h1>
            <p className="mt-4 max-w-lg text-lg text-surface/85">
              Hotels, houses, apartments, and warehouses from hosts on Nestora. Search by city and dates, then read the rules before you book.
            </p>
            <Link to="/host" className="mt-6 inline-flex h-11 items-center rounded-button bg-surface px-4 text-sm font-medium text-primary">List your property</Link>
          </div>
          <ul className="hidden flex-col justify-end gap-4 text-sm lg:flex">
            <li className="border-t border-surface/20 pt-3">A listing is public only after Nestora approves it.</li>
            <li className="border-t border-surface/20 pt-3">Fees and tax are in the total before checkout.</li>
            <li className="border-t border-surface/20 pt-3">Card numbers stay with the card network.</li>
          </ul>
        </div>
      </section>
      <div className="relative z-10 mx-auto -mt-12 max-w-6xl px-4">
        <SearchBar />
      </div>

      <section className="reveal mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">Browse by type</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROPERTY_TYPES.map((type) => {
            const count = counts.get(type.id) ?? 0;
            return (
              <Link key={type.id} to="/search" search={{ type: type.id }} className="rounded-card bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift">
                <p className="text-sm text-muted">{count === 0 ? "None live yet" : `${count} live`}</p>
                <h3 className="mt-6 font-display text-2xl">{type.label}</h3>
                <p className="mt-2 text-sm text-muted">{type.blurb}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="reveal mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">Featured stays</h2>
        <div className="mt-6">
          {!data && !error ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div> : null}
          {error ? <EmptyState title="Stays didn't load" body={error} /> : null}
          {data && data.stays.length === 0 ? (
            <EmptyState title="No live stays yet" body="Approved listings will show here with their city and nightly price." action={<Link to="/host" className="text-sm font-medium text-primary">List your property</Link>} />
          ) : null}
          {data && data.stays.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.stays.map((stay) => <StayCardView key={stay.id} stay={stay} />)}
            </div>
          ) : null}
        </div>
      </section>

      {data && data.destinations.length > 0 ? (
        <section className="reveal mx-auto mt-16 max-w-6xl px-4">
          <h2 className="font-display text-3xl">Popular destinations</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {data.destinations.map((place) => (
              <Link key={`${place.city}-${place.country}`} to="/search" search={{ location: place.city }} className="rounded-card bg-surface p-5 shadow-soft">
                <h3 className="font-display text-2xl">{place.city}</h3>
                <p className="mt-1 text-sm text-muted">{place.country} · {place.stays} {place.stays === 1 ? "stay" : "stays"}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="reveal mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">How it works</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            ["01", "Search", "Pick a city, dates, and who is coming. Filter by the kind of space you want."],
            ["02", "Book", "Read the photos, house rules, and cancellation policy. The total is shown before you pay."],
            ["03", "Stay", "Your trip, receipt, and cancellation live in your account after you book."],
          ].map(([step, title, body]) => (
            <article key={step} className="border-t border-line pt-4">
              <p className="font-display text-2xl text-accent">{step}</p>
              <h3 className="mt-2 font-display text-2xl">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reveal mx-auto mt-16 max-w-6xl px-4">
        <h2 className="font-display text-3xl">Why book with Nestora</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Secure payment", "You pay the card network. Nestora does not keep the card number."],
            ["Verified hosts", "A stay is searchable only after Nestora reviews the listing."],
            ["Clear cancellation", "Flexible, Moderate, or Strict is on the stay before you confirm."],
            ["A person can answer", "Questions about a booking go through the contact form, with the property and dates."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-card bg-surface p-5 shadow-soft">
              <h3 className="font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reveal mx-auto mt-16 max-w-6xl px-4">
        <div className="rounded-card bg-primary p-8 text-surface md:p-10">
          <h2 className="font-display text-4xl">List your property</h2>
          <p className="mt-3 max-w-xl text-surface/85">Draft the space, the price, and the rules. Nestora reviews it before guests can book. You keep the calendar.</p>
          <ul className="mt-4 max-w-xl list-disc space-y-1 pl-5 text-sm text-surface/85">
            <li>Hotels, houses, apartments, and warehouses</li>
            <li>Fees for hosts are shown before you publish</li>
            <li>Pause a live stay without deleting existing trips</li>
          </ul>
          <Link to="/host" className="mt-6 inline-flex h-11 items-center rounded-button bg-surface px-4 text-sm font-medium text-primary">List your property</Link>
        </div>
      </section>

      {showStats && stats ? (
        <section className="reveal mx-auto mt-16 max-w-6xl px-4">
          <dl className="grid gap-4 rounded-card bg-surface p-6 shadow-soft sm:grid-cols-3">
            <div><dt className="text-sm text-muted">Live stays</dt><dd className="font-display text-3xl">{stats.stays}</dd></div>
            <div><dt className="text-sm text-muted">Cities</dt><dd className="font-display text-3xl">{stats.cities}</dd></div>
            <div><dt className="text-sm text-muted">Completed and upcoming bookings</dt><dd className="font-display text-3xl">{stats.bookings}</dd></div>
          </dl>
        </section>
      ) : null}

      {data && data.reviews.length > 0 ? (
        <section className="reveal mx-auto mt-16 max-w-6xl px-4">
          <h2 className="font-display text-3xl">Guest reviews</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {data.reviews.map((review) => (
              <article key={review.id} className="rounded-card bg-surface p-5 shadow-soft">
                <p className="text-sm font-medium">{review.rating} / 5</p>
                <p className="mt-2 text-sm">{review.body}</p>
                <p className="mt-3 text-sm text-muted">{review.author} · <Link to="/stay/$slug" params={{ slug: review.slug }} className="text-primary">{review.title}</Link></p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {data && data.faqs.length > 0 ? (
        <section className="reveal mx-auto mt-16 max-w-6xl px-4">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-3xl">Questions</h2>
            <Link to="/faqs" className="text-sm font-medium text-primary">All FAQs</Link>
          </div>
          <div className="mt-4 divide-y divide-line rounded-card bg-surface px-5 shadow-soft">
            {data.faqs.map((faq) => (
              <details key={faq.id} className="py-4">
                <summary className="cursor-pointer font-medium">{faq.question}</summary>
                <p className="mt-2 text-sm text-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="reveal mx-auto mt-16 max-w-6xl px-4">
        <div className="rounded-card bg-surface p-6 shadow-soft md:flex md:items-end md:justify-between md:gap-8">
          <div>
            <h2 className="font-display text-3xl">Notes from Nestora</h2>
            <p className="mt-2 max-w-md text-sm text-muted">Leave your email for product notes. We store it and nothing else from this box.</p>
          </div>
          <form className="mt-4 flex flex-wrap gap-2 md:mt-0" onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
            setNews(null);
            subscribeNewsletterFn({ data: { email } })
              .then(() => { setNews("You're on the list."); setEmail(""); })
              .catch((reason: unknown) => setNews(reason instanceof Error ? reason.message : "Could not save that email."))
              .finally(() => setSaving(false));
          }}>
            <label className="sr-only" htmlFor="newsletter">Email</label>
            <input id="newsletter" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-11 rounded-[10px] border border-line bg-white px-3 text-sm" />
            <Button type="submit" loading={saving} loadingLabel="Saving...">Subscribe</Button>
          </form>
        </div>
        {news ? <p className="mt-2 text-sm">{news}</p> : null}
      </section>

      <section className="reveal mx-auto mt-16 max-w-6xl px-4">
        <div className="rounded-card border border-line bg-white px-6 py-10 text-center">
          <h2 className="font-display text-4xl">Ready when you are</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">Search a live stay, or start a host account and draft a listing.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/search" className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">Find a stay</Link>
            <Link to="/host" className="inline-flex h-11 items-center rounded-button border border-line bg-white px-4 text-sm font-medium">List your property</Link>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
