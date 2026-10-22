import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PROPERTY_TYPES, AMENITIES } from "@/lib/nestora/constants";
import {
  addMediaFn,
  createListingFn,
  loadListing,
  orderMediaFn,
  removeMediaFn,
  saveListingFn,
  submitListingFn,
} from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { Button, EmptyState, TextArea, TextInput } from "@/components/ui";

export const Route = createFileRoute("/host/listing/$propertyId")({ component: ListingPage });

const steps = ["Type", "Story", "Place", "Price", "Photos", "Review"];

type Draft = Awaited<ReturnType<typeof loadListing>>;

function ListingPage() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const dirty = useRef(false);

  useEffect(() => {
    if (propertyId === "new") return;
    let cancelled = false;
    loadListing({ data: { id: propertyId } })
      .then((row) => { if (!cancelled) setDraft(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open this listing."); });
    return () => { cancelled = true; };
  }, [propertyId]);

  useEffect(() => {
    if (!draft || propertyId === "new" || !dirty.current) return;
    const handle = window.setTimeout(() => {
      dirty.current = false;
      setSaving(true);
      saveListingFn({ data: draft })
        .then((next) => setDraft(next))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Save failed."))
        .finally(() => setSaving(false));
    }, 900);
    return () => window.clearTimeout(handle);
  }, [draft, propertyId]);

  async function start(type: "HOTEL" | "HOUSE" | "APARTMENT" | "WAREHOUSE") {
    setError(null);
    try {
      const created = await createListingFn({ data: { propertyType: type } });
      void navigate({ to: "/host/listing/$propertyId", params: { propertyId: created.id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the listing.");
    }
  }

  if (propertyId === "new") {
    return (
      <>
        <PageIntro title="New listing" body="Pick the kind of space. The draft is saved to your account. It stays off the public site until an operator approves it." />
        {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {PROPERTY_TYPES.map((type) => (
            <button key={type.id} type="button" className="rounded-card bg-surface p-5 text-left shadow-soft hover:shadow-lift" onClick={() => void start(type.id)}>
              <span className="font-display text-2xl">{type.label}</span>
              <p className="mt-2 text-sm text-muted">{type.blurb}</p>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (error && !draft) return <EmptyState title="Listing didn't open" body={error} />;
  if (!draft) return <p className="text-sm text-muted">Opening your draft…</p>;

  function patch(partial: Partial<Draft>) {
    dirty.current = true;
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  const cover = draft.media.find((item) => item.isCover) ?? draft.media.find((item) => item.kind === "IMAGE");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div>
        <PageIntro title={draft.title} body={`${draft.status.replaceAll("_", " ").toLowerCase()} · ${saving ? "Saving…" : "Saved to your account"}`} />
        <ol className="mb-6 flex gap-2 overflow-x-auto">
          {steps.map((label, index) => (
            <li key={label}>
              <button type="button" className={`h-11 rounded-button px-3 text-sm ${step === index ? "bg-primary text-surface" : "bg-surface text-ink"}`} onClick={() => setStep(index)}>
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
        {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
        {step === 1 ? (
          <div className="space-y-4">
            <label className="block text-sm">Title<TextInput className="mt-1.5" value={draft.title} onChange={(event) => patch({ title: event.target.value })} /></label>
            <label className="block text-sm">Summary<TextInput className="mt-1.5" value={draft.summary} maxLength={280} onChange={(event) => patch({ summary: event.target.value })} /></label>
            <label className="block text-sm">Description<TextArea className="mt-1.5" value={draft.description} onChange={(event) => patch({ description: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Num label="Guests" value={draft.maxGuests} onChange={(maxGuests) => patch({ maxGuests })} />
              <Num label="Bedrooms" value={draft.bedrooms} onChange={(bedrooms) => patch({ bedrooms })} />
              <Num label="Beds" value={draft.beds} onChange={(beds) => patch({ beds })} />
              <Num label="Baths" value={draft.bathrooms} onChange={(bathrooms) => patch({ bathrooms })} />
            </div>
            {draft.propertyType === "HOTEL" ? <Num label="Star rating (1–5)" value={draft.starRating ?? 0} onChange={(starRating) => patch({ starRating: starRating || null })} /> : null}
            {draft.propertyType === "WAREHOUSE" ? (
              <div className="grid grid-cols-2 gap-3">
                <Num label="Floor m²" value={draft.floorSqm ?? 0} onChange={(floorSqm) => patch({ floorSqm })} />
                <Num label="Ceiling m" value={draft.ceilingM ?? 0} onChange={(ceilingM) => patch({ ceilingM })} />
                <Num label="Loading docks" value={draft.loadingDocks} onChange={(loadingDocks) => patch({ loadingDocks })} />
                <Num label="Truck parking" value={draft.truckParking} onChange={(truckParking) => patch({ truckParking })} />
              </div>
            ) : null}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <label className="block text-sm">Street<TextInput className="mt-1.5" value={draft.addressLine} onChange={(event) => patch({ addressLine: event.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">City<TextInput className="mt-1.5" value={draft.city} onChange={(event) => patch({ city: event.target.value })} /></label>
              <label className="block text-sm">Region<TextInput className="mt-1.5" value={draft.region} onChange={(event) => patch({ region: event.target.value })} /></label>
              <label className="block text-sm">Postal code<TextInput className="mt-1.5" value={draft.postalCode} onChange={(event) => patch({ postalCode: event.target.value })} /></label>
              <label className="block text-sm">Country<TextInput className="mt-1.5" value={draft.country} onChange={(event) => patch({ country: event.target.value })} /></label>
              <label className="block text-sm">Latitude<TextInput className="mt-1.5" value={draft.lat ?? ""} onChange={(event) => patch({ lat: event.target.value === "" ? null : Number(event.target.value) })} /></label>
              <label className="block text-sm">Longitude<TextInput className="mt-1.5" value={draft.lng ?? ""} onChange={(event) => patch({ lng: event.target.value === "" ? null : Number(event.target.value) })} /></label>
            </div>
            <p className="text-sm text-muted">Drop the pin by entering latitude and longitude. The map below uses that pin. A Mapbox token replaces the OpenStreetMap frame when VITE_MAPBOX_TOKEN is set.</p>
            <MapPin lat={draft.lat} lng={draft.lng} />
          </div>
        ) : null}
        {step === 3 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Money label="Nightly" cents={draft.nightlyCents} onChange={(cents) => patch({ nightlyCents: cents ?? 0 })} />
            <Money label="Weekend (blank to skip)" cents={draft.weekendCents} onChange={(weekendCents) => patch({ weekendCents })} allowEmpty />
            <Money label="Cleaning" cents={draft.cleaningFeeCents} onChange={(cents) => patch({ cleaningFeeCents: cents ?? 0 })} />
            <Money label="Extra guest / night" cents={draft.extraGuestFeeCents} onChange={(cents) => patch({ extraGuestFeeCents: cents ?? 0 })} />
            <Num label="Guests included" value={draft.includedGuests} onChange={(includedGuests) => patch({ includedGuests: Math.max(1, includedGuests) })} />
            <Money label="Security deposit (not charged in the stay total)" cents={draft.securityDepositCents} onChange={(cents) => patch({ securityDepositCents: cents ?? 0 })} />
            <Num label="Weekly discount %" value={draft.weeklyDiscountBps / 100} onChange={(value) => patch({ weeklyDiscountBps: Math.round(value * 100) })} />
            <Num label="Monthly discount %" value={draft.monthlyDiscountBps / 100} onChange={(value) => patch({ monthlyDiscountBps: Math.round(value * 100) })} />
            <Num label="Minimum nights" value={draft.minNights} onChange={(minNights) => patch({ minNights: Math.max(1, minNights) })} />
            <Num label="Maximum nights (0 = none)" value={draft.maxNights ?? 0} onChange={(maxNights) => patch({ maxNights: maxNights || null })} />
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.instantBook} onChange={(event) => patch({ instantBook: event.target.checked })} /> Instant book</label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.petsAllowed} onChange={(event) => patch({ petsAllowed: event.target.checked })} /> Pets allowed</label>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-4">
            <form className="flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              addMediaFn({ data: { id: draft.id, url: photoUrl, kind: "IMAGE" } })
                .then((next) => { setDraft(next); setPhotoUrl(""); setError(null); })
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not add that photo."));
            }}>
              <TextInput value={photoUrl} placeholder="https://…" onChange={(event) => setPhotoUrl(event.target.value)} />
              <Button type="submit">Add photo</Button>
            </form>
            <p className="text-sm text-muted">Drag to reorder. The cover is what search shows. Cloudinary upload is used when those keys are set; an https address works either way. Card numbers are never accepted here.</p>
            <ul className="space-y-2">
              {draft.media.map((item) => (
                <li key={item.id} draggable className="flex items-center justify-between gap-3 rounded-card bg-surface p-3 shadow-soft" onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  event.preventDefault();
                  const from = event.dataTransfer.getData("text/plain");
                  const ids = draft.media.map((media) => media.id);
                  const next = ids.filter((id) => id !== from);
                  const index = next.indexOf(item.id);
                  next.splice(index, 0, from);
                  orderMediaFn({ data: { id: draft.id, ids: next, coverId: draft.media.find((media) => media.isCover)?.id ?? null } })
                    .then(setDraft)
                    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not reorder."));
                }}>
                  <span className="truncate text-sm">{item.url}</span>
                  <span className="flex gap-2">
                    <button type="button" className="text-sm text-primary" onClick={() => orderMediaFn({ data: { id: draft.id, ids: draft.media.map((media) => media.id), coverId: item.id } }).then(setDraft)}>Cover</button>
                    <button type="button" className="text-sm text-danger" onClick={() => removeMediaFn({ data: { id: draft.id, mediaId: item.id } }).then(setDraft)}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
            <label className="block text-sm">Video https link<TextInput className="mt-1.5" value={draft.videoUrl ?? ""} onChange={(event) => patch({ videoUrl: event.target.value || null })} /></label>
            <label className="block text-sm">3D tour https link<TextInput className="mt-1.5" value={draft.tourUrl ?? ""} onChange={(event) => patch({ tourUrl: event.target.value || null })} /></label>
          </div>
        ) : null}
        {step === 5 ? (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Amenities</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {AMENITIES.map((amenity) => (
                  <label key={amenity} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={draft.amenities.includes(amenity)} onChange={() => {
                      const amenities = draft.amenities.includes(amenity) ? draft.amenities.filter((item) => item !== amenity) : [...draft.amenities, amenity];
                      patch({ amenities });
                    }} />
                    {amenity}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">House rules<TextArea className="mt-1.5" value={draft.houseRules} onChange={(event) => patch({ houseRules: event.target.value })} /></label>
            <label className="block text-sm">Cancellation
              <select className="mt-1.5 h-11 w-full rounded-button border border-line bg-surface px-3" value={draft.cancellationPolicy} onChange={(event) => patch({ cancellationPolicy: event.target.value as Draft["cancellationPolicy"] })}>
                <option value="FLEXIBLE">Flexible</option>
                <option value="MODERATE">Moderate</option>
                <option value="STRICT">Strict</option>
              </select>
            </label>
            {draft.rejectionReason ? <p className="text-sm text-danger">Last rejection: {draft.rejectionReason}</p> : null}
            <Button type="button" onClick={() => {
              submitListingFn({ data: { id: draft.id } })
                .then((next) => { setDraft(next); setError(null); })
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not submit."));
            }}>Submit for review</Button>
          </div>
        ) : null}
        {step === 0 ? <p className="text-sm text-muted">This draft is a {draft.propertyType.toLowerCase()}. Type is fixed after creation so the fields stay honest.</p> : null}
        <div className="mt-6 flex gap-2">
          <Button type="button" variant="quiet" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</Button>
          <Button type="button" disabled={step === steps.length - 1} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Continue</Button>
          <Link to="/host/properties" className="inline-flex h-11 items-center px-3 text-sm text-muted">All properties</Link>
        </div>
      </div>
      <aside className="h-fit rounded-card bg-surface p-4 shadow-soft lg:sticky lg:top-20">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Preview</p>
        {cover ? <img src={cover.url} alt="" className="mt-3 h-36 w-full rounded-button object-cover" /> : <div className="mt-3 grid h-36 place-items-center rounded-button bg-bg text-sm text-muted">No cover yet</div>}
        <h2 className="mt-3 font-display text-2xl">{draft.title}</h2>
        <p className="text-sm text-muted">{[draft.city, draft.country].filter(Boolean).join(", ") || "Location not set"}</p>
        <p className="mt-2 text-sm tabular-nums">{formatMoney(draft.nightlyCents)} / night</p>
        <p className="mt-2 text-sm text-muted">{draft.summary || "The summary shows here once you write it."}</p>
      </aside>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm">{label}
      <TextInput className="mt-1.5" inputMode="decimal" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  );
}

function Money({ label, cents, onChange, allowEmpty }: { label: string; cents: number | null; onChange: (cents: number | null) => void; allowEmpty?: boolean }) {
  return (
    <label className="block text-sm">{label}
      <TextInput className="mt-1.5" inputMode="decimal" value={cents == null ? "" : (cents / 100).toFixed(2)} onChange={(event) => {
        if (allowEmpty && event.target.value.trim() === "") { onChange(null); return; }
        const amount = Number(event.target.value);
        onChange(Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0);
      }} />
    </label>
  );
}

function MapPin({ lat, lng }: { lat: number | null; lng: number | null }) {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return <p className="text-sm text-muted">Add a latitude and longitude to see the pin.</p>;
  }
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (token) {
    const src = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+e36f47(${lng},${lat})/${lng},${lat},13,0/640x280?access_token=${token}`;
    return <img src={src} alt="Map pin for this listing" className="h-56 w-full rounded-card object-cover" />;
  }
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.04}%2C${lat - 0.03}%2C${lng + 0.04}%2C${lat + 0.03}&layer=mapnik&marker=${lat}%2C${lng}`;
  return <iframe title="Map pin" src={src} className="h-56 w-full rounded-card border border-line" />;
}
