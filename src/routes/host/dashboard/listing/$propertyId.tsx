import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PROPERTY_TYPES, AMENITIES } from "@/lib/nestora/constants";
import { createListingFn, loadListing, saveListingFn, submitListingFn } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import {
  AmenityPicker,
  ChoiceCards,
  FormSection,
  NumberStepper,
  PlaceSearch,
  PriceField,
  StarRating,
  TextAreaField,
  TextField,
  ToggleField,
} from "@/components/forms";
import { MediaUploader } from "@/components/media-uploader";
import { Button, EmptyState } from "@/components/ui";

export const Route = createFileRoute("/host/dashboard/listing/$propertyId")({ component: ListingPage });

const steps = ["Type", "Story", "Place", "Price", "Photos", "Review"];

type Draft = Awaited<ReturnType<typeof loadListing>>;

function ListingPage() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(propertyId === "new" ? 0 : 1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; city?: string; country?: string; price?: string; photos?: string; step?: number }>({});

  useEffect(() => {
    if (propertyId === "new") return;
    let cancelled = false;
    loadListing({ data: { id: propertyId } })
      .then((row) => { if (!cancelled) setDraft(row); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open this listing."); });
    return () => { cancelled = true; };
  }, [propertyId]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function start(type: "HOTEL" | "HOUSE" | "APARTMENT" | "WAREHOUSE") {
    setError(null);
    setStarting(type);
    try {
      const created = await createListingFn({ data: { propertyType: type } });
      void navigate({ to: "/host/dashboard/listing/$propertyId", params: { propertyId: created.id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the listing.");
    } finally {
      setStarting(null);
    }
  }

  if (propertyId === "new") {
    return (
      <>
        <PageIntro title="New listing" body="Pick the kind of space. The draft stays private until you send it for review." />
        {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {PROPERTY_TYPES.map((type) => (
            <Button
              key={type.id}
              type="button"
              variant="quiet"
              className="h-auto flex-col items-start px-5 py-5 text-left"
              loading={starting === type.id}
              loadingLabel="Creating..."
              disabled={starting !== null}
              onClick={() => void start(type.id)}
            >
              <span className="font-display text-2xl">{type.label}</span>
              <span className="mt-2 block text-sm font-normal text-muted">{type.blurb}</span>
            </Button>
          ))}
        </div>
      </>
    );
  }

  if (error && !draft) return <EmptyState title="Listing didn't open" body={error} />;
  if (!draft) return <p className="text-sm text-muted">Opening your draft…</p>;

  function patch(partial: Partial<Draft>) {
    setDirty(true);
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  async function saveDraft() {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveListingFn({ data: draft });
      setDirty(false);
      setSavedAt(new Date());
      toast.success("Draft saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function leave() {
    if (dirty && !window.confirm("You have unsaved changes. Leave this listing anyway?")) return;
    void navigate({ to: "/host/dashboard/properties" });
  }

  async function submit() {
    if (!draft) return;
    const nextErrors: typeof fieldErrors = {};
    if (!draft.title.trim() || draft.title === "Untitled stay") nextErrors.title = "Add a real title.";
    if (!draft.city.trim()) nextErrors.city = "Add a city.";
    if (!draft.country.trim()) nextErrors.country = "Add a country.";
    if (draft.nightlyCents <= 0) nextErrors.price = "Add a nightly price.";
    if (draft.media.filter((item) => item.kind === "IMAGE").length === 0) nextErrors.photos = "Add at least one photo.";
    const stepFor = nextErrors.title ? 1 : nextErrors.city || nextErrors.country ? 2 : nextErrors.price ? 3 : nextErrors.photos ? 4 : null;
    if (stepFor != null) {
      setFieldErrors({ ...nextErrors, step: stepFor });
      setStep(stepFor);
      setError("Fill in the highlighted fields before sending this for review.");
      document.getElementById("listing-top")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    setError(null);
    try {
      await saveListingFn({ data: draft });
      await submitListingFn({ data: { id: draft.id } });
      setDirty(false);
      toast.success("Your listing was submitted for review. We'll email you once it's approved.");
      await navigate({ to: "/host/dashboard/properties", search: { submitted: 1 } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit.");
      document.getElementById("listing-top")?.scrollIntoView({ behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  const cover = draft.media.find((item) => item.isCover) ?? draft.media.find((item) => item.kind === "IMAGE");
  const locked = draft.status === "PENDING_REVIEW";

  return (
    <div id="listing-top" className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#D9D3C7] bg-white/95 px-3 py-2 shadow-soft backdrop-blur">
          <p className="text-sm text-muted">
            {dirty ? "Unsaved changes" : savedAt ? `Last saved at ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved"}
          </p>
          <Button type="button" loading={saving} loadingLabel="Saving..." disabled={locked} onClick={() => void saveDraft()}>Save draft</Button>
        </div>
        <PageIntro title={draft.title} body={draft.status.replaceAll("_", " ").toLowerCase()} />
        <ol className="flex gap-2 overflow-x-auto">
          {steps.map((label, index) => (
            <li key={label}>
              <button type="button" className={`h-11 whitespace-nowrap rounded-[10px] px-3 text-sm ${step === index ? "bg-primary text-surface" : "bg-white text-ink"}`} onClick={() => setStep(index)}>
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {locked ? <p className="text-sm text-muted">This listing is in review. You can look, but changes wait until a decision.</p> : null}

        {step === 0 ? (
          <FormSection title="Property type" body="Type stays fixed after the draft is created.">
            <p className="text-sm md:col-span-2">This draft is a {draft.propertyType.toLowerCase()}.</p>
          </FormSection>
        ) : null}

        {step === 1 ? (
          <FormSection title="The story">
            <div className="md:col-span-2"><TextField label="Title" required value={draft.title} error={fieldErrors.title} onChange={(title) => patch({ title })} /></div>
            <div className="md:col-span-2"><TextAreaField label="Summary" value={draft.summary} maxLength={280} onChange={(summary) => patch({ summary })} /></div>
            <div className="md:col-span-2"><TextAreaField label="Description" value={draft.description} maxLength={4000} onChange={(description) => patch({ description })} /></div>
            <NumberStepper label="Guests" value={draft.maxGuests} min={1} max={100} onChange={(maxGuests) => patch({ maxGuests })} />
            <NumberStepper label="Bedrooms" value={draft.bedrooms} max={50} onChange={(bedrooms) => patch({ bedrooms })} />
            <NumberStepper label="Beds" value={draft.beds} max={100} onChange={(beds) => patch({ beds })} />
            <NumberStepper label="Bathrooms" value={draft.bathrooms} max={50} step={0.5} onChange={(bathrooms) => patch({ bathrooms })} />
            {draft.propertyType === "HOTEL" ? <StarRating label="Star rating" value={draft.starRating} onChange={(starRating) => patch({ starRating })} /> : null}
            {draft.propertyType === "WAREHOUSE" ? (
              <>
                <TextField label="Floor area (m²)" value={String(draft.floorSqm ?? "")} onChange={(value) => patch({ floorSqm: value === "" ? null : Number(value) || 0 })} />
                <TextField label="Ceiling height (m)" value={String(draft.ceilingM ?? "")} onChange={(value) => patch({ ceilingM: value === "" ? null : Number(value) || 0 })} />
                <NumberStepper label="Loading docks" value={draft.loadingDocks} max={100} onChange={(loadingDocks) => patch({ loadingDocks })} />
                <NumberStepper label="Truck parking" value={draft.truckParking} max={200} onChange={(truckParking) => patch({ truckParking })} />
              </>
            ) : null}
            {draft.propertyType === "HOTEL" ? (
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Room types</p>
                  <Button type="button" variant="quiet" onClick={() => patch({
                    rooms: [...draft.rooms, { id: crypto.randomUUID(), name: "New room", quantity: 1, nightlyCents: draft.nightlyCents || 10000, maxGuests: 2, beds: 1, description: "" }],
                  })}>Add room</Button>
                </div>
                {draft.rooms.map((room, index) => (
                  <div key={room.id} className="grid gap-3 rounded-[10px] border border-[#D9D3C7] bg-white p-3 md:grid-cols-2">
                    <TextField label="Room name" value={room.name} onChange={(name) => {
                      const rooms = draft.rooms.slice();
                      rooms[index] = { ...room, name };
                      patch({ rooms });
                    }} />
                    <NumberStepper label="How many" value={room.quantity} min={1} max={200} onChange={(quantity) => {
                      const rooms = draft.rooms.slice();
                      rooms[index] = { ...room, quantity };
                      patch({ rooms });
                    }} />
                    <PriceField label="Nightly" cents={room.nightlyCents} onChange={(cents) => {
                      const rooms = draft.rooms.slice();
                      rooms[index] = { ...room, nightlyCents: cents ?? 0 };
                      patch({ rooms });
                    }} />
                    <NumberStepper label="Guests" value={room.maxGuests} min={1} onChange={(maxGuests) => {
                      const rooms = draft.rooms.slice();
                      rooms[index] = { ...room, maxGuests };
                      patch({ rooms });
                    }} />
                    <Button type="button" variant="danger" onClick={() => patch({ rooms: draft.rooms.filter((item) => item.id !== room.id) })}>Remove room</Button>
                  </div>
                ))}
              </div>
            ) : null}
          </FormSection>
        ) : null}

        {step === 2 ? (
          <FormSection title="Where it is">
            <PlaceSearch onPick={(place) => patch({ addressLine: place.label.slice(0, 160), lat: place.lat, lng: place.lng })} />
            <div className="md:col-span-2"><TextField label="Street" value={draft.addressLine} onChange={(addressLine) => patch({ addressLine })} /></div>
            <TextField label="City" required value={draft.city} error={fieldErrors.city} onChange={(city) => patch({ city })} />
            <TextField label="Region" value={draft.region} onChange={(region) => patch({ region })} />
            <TextField label="Postal code" value={draft.postalCode} onChange={(postalCode) => patch({ postalCode })} />
            <TextField label="Country" required value={draft.country} error={fieldErrors.country} onChange={(country) => patch({ country })} />
            <TextField label="Latitude" value={draft.lat == null ? "" : String(draft.lat)} onChange={(value) => patch({ lat: value === "" ? null : Number(value) })} />
            <TextField label="Longitude" value={draft.lng == null ? "" : String(draft.lng)} onChange={(value) => patch({ lng: value === "" ? null : Number(value) })} />
            <div className="md:col-span-2"><MapPin lat={draft.lat} lng={draft.lng} /></div>
          </FormSection>
        ) : null}

        {step === 3 ? (
          <FormSection title="Price and stay rules">
            <div>
              <PriceField label="Nightly" cents={draft.nightlyCents} onChange={(cents) => patch({ nightlyCents: cents ?? 0 })} />
              {fieldErrors.price ? <p className="mt-1 text-xs text-danger">{fieldErrors.price}</p> : null}
            </div>
            <PriceField label="Weekend" cents={draft.weekendCents} allowEmpty hint="Leave blank to use the nightly price." onChange={(weekendCents) => patch({ weekendCents })} />
            <PriceField label="Cleaning" cents={draft.cleaningFeeCents} onChange={(cents) => patch({ cleaningFeeCents: cents ?? 0 })} />
            <PriceField label="Extra guest / night" cents={draft.extraGuestFeeCents} onChange={(cents) => patch({ extraGuestFeeCents: cents ?? 0 })} />
            <NumberStepper label="Guests included" value={draft.includedGuests} min={1} max={100} onChange={(includedGuests) => patch({ includedGuests })} />
            <PriceField label="Security deposit" cents={draft.securityDepositCents} hint="Shown, not charged with the stay." onChange={(cents) => patch({ securityDepositCents: cents ?? 0 })} />
            <NumberStepper label="Weekly discount %" value={draft.weeklyDiscountBps / 100} max={90} onChange={(value) => patch({ weeklyDiscountBps: Math.round(value * 100) })} />
            <NumberStepper label="Monthly discount %" value={draft.monthlyDiscountBps / 100} max={90} onChange={(value) => patch({ monthlyDiscountBps: Math.round(value * 100) })} />
            <NumberStepper label="Minimum nights" value={draft.minNights} min={1} max={365} onChange={(minNights) => patch({ minNights })} />
            <NumberStepper label="Maximum nights" value={draft.maxNights ?? 0} max={365} hint="0 means no maximum." onChange={(maxNights) => patch({ maxNights: maxNights || null })} />
            <ToggleField label="Instant book" checked={draft.instantBook} onChange={(instantBook) => patch({ instantBook })} />
            <ToggleField label="Pets allowed" checked={draft.petsAllowed} onChange={(petsAllowed) => patch({ petsAllowed })} />
            <TextField label="Check-in" value={draft.checkInTime} onChange={(checkInTime) => patch({ checkInTime })} />
            <TextField label="Check-out" value={draft.checkOutTime} onChange={(checkOutTime) => patch({ checkOutTime })} />
          </FormSection>
        ) : null}

        {step === 4 ? (
          <FormSection title="Photos and video">
            {fieldErrors.photos ? <p className="text-sm text-danger md:col-span-2">{fieldErrors.photos}</p> : null}
            <MediaUploader
              propertyId={draft.id}
              media={draft.media}
              onChange={(next) => {
                if ("error" in next) setError(next.error);
                else setDraft((current) => (current ? { ...current, media: next } : current));
              }}
            />
            <div className="md:col-span-2">
              <TextField label="3D virtual tour" value={draft.tourUrl ?? ""} hint="Paste an https link. Photos and video are uploaded above, not linked." onChange={(value) => patch({ tourUrl: value.trim() || null })} />
            </div>
            {draft.tourUrl?.startsWith("https://") ? (
              <iframe title="Virtual tour preview" src={draft.tourUrl} className="h-64 w-full rounded-[10px] border border-[#D9D3C7] md:col-span-2" />
            ) : null}
          </FormSection>
        ) : null}

        {step === 5 ? (
          <FormSection title="Rules and review">
            <AmenityPicker value={draft.amenities} options={AMENITIES} onChange={(amenities) => patch({ amenities })} />
            <div className="md:col-span-2"><TextAreaField label="House rules" value={draft.houseRules} maxLength={2000} onChange={(houseRules) => patch({ houseRules })} /></div>
            <div className="md:col-span-2">
              <ChoiceCards
                label="Cancellation"
                value={draft.cancellationPolicy}
                onChange={(value) => patch({ cancellationPolicy: value as Draft["cancellationPolicy"] })}
                options={[
                  { value: "FLEXIBLE", label: "Flexible", hint: "Full refund until shortly before check-in." },
                  { value: "MODERATE", label: "Moderate", hint: "A partial refund if they cancel in time." },
                  { value: "STRICT", label: "Strict", hint: "Most of the stay is kept if they cancel late." },
                ]}
              />
            </div>
            <ToggleField label="Children allowed" checked={draft.childrenAllowed} onChange={(childrenAllowed) => patch({ childrenAllowed })} />
            <ToggleField label="Smoking allowed" checked={draft.smokingAllowed} onChange={(smokingAllowed) => patch({ smokingAllowed })} />
            <ToggleField label="Parties allowed" checked={draft.partiesAllowed} onChange={(partiesAllowed) => patch({ partiesAllowed })} />
            {draft.rejectionReason ? <p className="text-sm text-danger md:col-span-2">Last note: {draft.rejectionReason}</p> : null}
            <Button
              type="button"
              loading={submitting}
              loadingLabel="Sending..."
              disabled={locked || saving}
              onClick={() => void submit()}
            >
              Submit for review
            </Button>
          </FormSection>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="quiet" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</Button>
          <Button type="button" disabled={step === steps.length - 1} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Continue</Button>
          <Button type="button" variant="quiet" loading={saving} loadingLabel="Saving..." disabled={locked} onClick={() => void saveDraft()}>Save draft</Button>
          <button type="button" className="inline-flex h-11 items-center px-3 text-sm text-muted" onClick={leave}>All properties</button>
        </div>
      </div>
      <aside className="h-fit rounded-card bg-surface p-4 shadow-soft lg:sticky lg:top-20">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Preview</p>
        {cover ? <img src={cover.url} alt="" className="mt-3 h-36 w-full rounded-[10px] object-cover" /> : <div className="mt-3 grid h-36 place-items-center rounded-[10px] bg-bg text-sm text-muted">No cover yet</div>}
        <h2 className="mt-3 font-display text-2xl">{draft.title}</h2>
        <p className="text-sm text-muted">{[draft.city, draft.country].filter(Boolean).join(", ") || "Location not set"}</p>
        <p className="mt-2 text-sm tabular-nums">{formatMoney(draft.nightlyCents)} / night</p>
        <p className="mt-2 text-sm text-muted">{draft.summary || "The summary shows here once you write it."}</p>
      </aside>
    </div>
  );
}

function MapPin({ lat, lng }: { lat: number | null; lng: number | null }) {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return <p className="text-sm text-muted">Search for an address, or enter a latitude and longitude, to see the pin.</p>;
  }
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (token) {
    const src = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+e36f47(${lng},${lat})/${lng},${lat},13,0/640x280?access_token=${token}`;
    return <img src={src} alt="Map pin for this listing" className="h-56 w-full rounded-[10px] object-cover" />;
  }
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.04}%2C${lat - 0.03}%2C${lng + 0.04}%2C${lat + 0.03}&layer=mapnik&marker=${lat}%2C${lng}`;
  return <iframe title="Map pin" src={src} className="h-56 w-full rounded-[10px] border border-[#D9D3C7]" />;
}
