import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadStay, quoteTrip, holdTrip, toggleSave } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PublicFrame } from "@/components/site-chrome";
import { Button, EmptyState, Skeleton, TextInput } from "@/components/ui";

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
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const [stay, setStay] = useState<Awaited<ReturnType<typeof loadStay>> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteTrip>> | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStay({ data: { slug } })
      .then((row) => { if (!cancelled) setStay(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load this stay."); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!stay || !checkIn || !checkOut) return;
    let cancelled = false;
    quoteTrip({ data: { slug, checkIn, checkOut, adults, children, infants, petCount: pets } })
      .then((row) => { if (!cancelled) { setQuote(row); setQuoteError(null); } })
      .catch((reason: unknown) => { if (!cancelled) { setQuote(null); setQuoteError(reason instanceof Error ? reason.message : "Could not price those dates."); } });
    return () => { cancelled = true; };
  }, [stay, slug, checkIn, checkOut, adults, children, infants, pets]);

  const images = stay?.media.filter((item) => item.kind === "IMAGE") ?? [];
  const videos = stay?.media.filter((item) => item.kind === "VIDEO") ?? [];
  const current = images[photo];

  return (
    <PublicFrame>
      <div className="mx-auto max-w-6xl px-4 py-10">
        {stay === undefined && !error ? <Skeleton className="h-72" /> : null}
        {error ? <EmptyState title="This stay didn't load" body={error} /> : null}
        {stay === null ? (
          <EmptyState title="This stay isn't listed" body="It may be a draft, or it was never approved." action={<Link to="/search" className="text-sm font-medium text-primary">Back to search</Link>} />
        ) : null}
        {stay ? (
          <article className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">{stay.propertyType.toLowerCase()}</p>
              <h1 className="mt-2 font-display text-5xl">{stay.title}</h1>
              <p className="mt-3 text-sm text-muted">{[stay.city, stay.region, stay.country].filter(Boolean).join(", ")}</p>
              {current ? (
                <button type="button" className="mt-6 block w-full" onClick={() => setPhoto((value) => (value + 1) % images.length)}>
                  <img src={current.url} alt="" className="h-80 w-full rounded-card object-cover" />
                </button>
              ) : (
                <div className="mt-6 grid h-48 place-items-center rounded-card bg-surface text-sm text-muted">No photos yet</div>
              )}
              <p className="mt-6 text-sm leading-relaxed">{stay.description || stay.summary || "The host hasn't written a description yet."}</p>
              <dl className="mt-8 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div><dt className="text-muted">Guests</dt><dd className="font-medium tabular-nums">{stay.maxGuests}</dd></div>
                <div><dt className="text-muted">Bedrooms</dt><dd className="font-medium tabular-nums">{stay.bedrooms}</dd></div>
                <div><dt className="text-muted">Beds</dt><dd className="font-medium tabular-nums">{stay.beds}</dd></div>
                <div><dt className="text-muted">Baths</dt><dd className="font-medium tabular-nums">{stay.bathrooms}</dd></div>
              </dl>
              {stay.propertyType === "HOTEL" && stay.starRating ? <p className="mt-4 text-sm">{stay.starRating} star hotel</p> : null}
              {stay.propertyType === "WAREHOUSE" ? (
                <p className="mt-4 text-sm text-muted">{stay.floorSqm ?? "—"} m² · ceiling {stay.ceilingM ?? "—"} m · {stay.loadingDocks} docks · truck parking {stay.truckParking}</p>
              ) : null}
              <ul className="mt-8 flex flex-wrap gap-2">
                {stay.amenities.map((amenity) => <li key={amenity} className="rounded-button bg-surface px-3 py-2 text-sm shadow-soft">{amenity}</li>)}
              </ul>
              {videos.length > 0 ? (
                <section className="mt-8 space-y-3">
                  <h2 className="font-display text-2xl">Video</h2>
                  {videos.map((item) => <video key={item.id} src={item.url} controls className="w-full rounded-card" />)}
                </section>
              ) : null}
              <section className="mt-8">
                <h2 className="font-display text-2xl">House rules</h2>
                <p className="mt-2 text-sm text-muted">{stay.houseRules || "The host hasn't added house rules."}</p>
                <p className="mt-3 text-sm">Check-in {stay.checkInTime} · Check-out {stay.checkOutTime} · {stay.minNights} night minimum · Pets {stay.petsAllowed ? "allowed" : "not allowed"}</p>
              </section>
              <section className="mt-8">
                <h2 className="font-display text-2xl">Cancellation</h2>
                <p className="mt-2 text-sm text-muted">{stay.cancellationSummary || stay.cancellationPolicy.toLowerCase()}</p>
              </section>
              <section className="mt-8">
                <h2 className="font-display text-2xl">Host</h2>
                <p className="mt-2 text-sm">{stay.hostName} {stay.hostVerified ? "· Verified" : ""}</p>
              </section>
              <section className="mt-8">
                <h2 className="font-display text-2xl">Reviews</h2>
                <p className="mt-2 text-sm text-muted">{stay.reviewCount === 0 ? "No reviews yet. A guest can review only after a completed stay." : `${stay.avgRating.toFixed(1)} from ${stay.reviewCount}`}</p>
                <ul className="mt-4 space-y-3">
                  {stay.reviews.map((review) => (
                    <li key={review.id} className="rounded-card bg-surface p-4 shadow-soft">
                      <p className="text-sm font-medium">{review.rating} / 5</p>
                      <p className="mt-1 text-sm">{review.body}</p>
                      {review.owner_reply ? <p className="mt-2 text-sm text-muted">Host: {review.owner_reply}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
              {stay.tourUrl ? (
                <section className="mt-8">
                  <h2 className="font-display text-2xl">Virtual tour</h2>
                  <iframe title="Virtual tour" src={stay.tourUrl} className="mt-3 h-72 w-full rounded-card border border-line" />
                </section>
              ) : null}
              {stay.similar.length > 0 ? (
                <section className="mt-8">
                  <h2 className="font-display text-2xl">Similar stays</h2>
                  <ul className="mt-3 space-y-2">
                    {stay.similar.map((item) => (
                      <li key={item.slug}><Link to="/stay/$slug" params={{ slug: item.slug }} className="text-sm text-primary">{item.title} · {item.city} · {formatMoney(item.nightly_cents)}</Link></li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "LodgingBusiness",
                name: stay.title,
                description: stay.summary || stay.description,
                address: { "@type": "PostalAddress", addressLocality: stay.city, addressCountry: stay.country },
              }) }} />
            </div>
            <aside className="h-fit rounded-card bg-surface p-5 shadow-lift lg:sticky lg:top-20">
              <p className="font-display text-3xl tabular-nums">{formatMoney(stay.nightlyCents, stay.currency.toUpperCase())} <span className="text-base text-muted">/ night</span></p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="text-sm">Check-in<TextInput className="mt-1" type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></label>
                <label className="text-sm">Check-out<TextInput className="mt-1" type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></label>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <label className="text-sm">Adults<TextInput className="mt-1" inputMode="numeric" value={adults} onChange={(event) => setAdults(Math.max(1, Number(event.target.value) || 1))} /></label>
                <label className="text-sm">Children<TextInput className="mt-1" inputMode="numeric" value={children} onChange={(event) => setChildren(Math.max(0, Number(event.target.value) || 0))} /></label>
                <label className="text-sm">Infants<TextInput className="mt-1" inputMode="numeric" value={infants} onChange={(event) => setInfants(Math.max(0, Number(event.target.value) || 0))} /></label>
              </div>
              {quoteError ? <p className="mt-3 text-sm text-danger">{quoteError}</p> : null}
              {quote ? (
                <ul className="mt-4 space-y-1 text-sm">
                  {quote.lines.map((line) => (
                    <li key={line.label} className="flex justify-between gap-3"><span>{line.label}</span><span className="tabular-nums">{formatMoney(line.cents, stay.currency.toUpperCase())}</span></li>
                  ))}
                  <li className="flex justify-between gap-3 border-t border-line pt-2 font-medium"><span>Total</span><span className="tabular-nums">{formatMoney(quote.totalCents, stay.currency.toUpperCase())}</span></li>
                  {quote.securityDepositCents > 0 ? <li className="text-muted">Security deposit {formatMoney(quote.securityDepositCents)} is not included in the charge.</li> : null}
                </ul>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" loading={busy} loadingLabel="Holding dates..." disabled={!quote} onClick={() => {
                  if (!user) { void navigate({ to: "/login" }); return; }
                  setBusy(true);
                  holdTrip({ data: { slug, checkIn, checkOut, adults, children, infants, petCount: pets, requests: "" } })
                    .then((hold) => navigate({ to: "/checkout/$bookingId", params: { bookingId: hold.bookingId } }))
                    .catch((reason: unknown) => setQuoteError(reason instanceof Error ? reason.message : "Could not hold those dates."))
                    .finally(() => setBusy(false));
                }}>{stay.instantBook ? "Book" : "Request"}</Button>
                <Button variant="quiet" disabled={!user} onClick={() => toggleSave({ data: { propertyId: stay.id } }).catch(() => setQuoteError("Sign in to save a stay."))}>Save</Button>
              </div>
              <button type="button" className="mt-3 text-sm text-primary" onClick={() => { void navigator.clipboard?.writeText(window.location.href); }}>Share</button>
              <p className="mt-3 text-xs text-muted">A request holds the dates for 15 minutes. No card number is stored on Nestora.</p>
            </aside>
          </article>
        ) : null}
      </div>
    </PublicFrame>
  );
}
