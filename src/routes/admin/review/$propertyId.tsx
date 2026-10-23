import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AMENITIES, PROPERTY_TYPES } from "@/lib/nestora/constants";
import { loadReviewListing, reviewListing, saveListingFn } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import {
  AmenityPicker,
  ChoiceCards,
  FormSection,
  NumberStepper,
  PriceField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
  useConfirm,
} from "@/components/forms";
import { MediaUploader } from "@/components/media-uploader";
import { PhotoGallery } from "@/components/gallery";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/review/$propertyId")({ component: ReviewPage });

type Bundle = Awaited<ReturnType<typeof loadReviewListing>>;
type Draft = Bundle["listing"];

function ReviewPage() {
  const { propertyId } = Route.useParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [owner, setOwner] = useState<Bundle["owner"] | null>(null);
  const [events, setEvents] = useState<Bundle["events"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [note, setNote] = useState("");
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;
    loadReviewListing({ data: { id: propertyId } })
      .then((next) => {
        if (cancelled) return;
        setDraft(next.listing);
        setOwner(next.owner);
        setEvents(next.events);
        setNote(next.listing.rejectionReason ?? "");
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open this listing."); });
    return () => { cancelled = true; };
  }, [propertyId]);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await saveListingFn({ data: draft });
      toast.success("Changes saved");
      setEvents((current) => [{ id: `local-${Date.now()}`, action: "EDIT", note: `Saved ${draft.title}`, created_at: new Date().toISOString(), actor: "You" }, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function decide(decision: "APPROVE" | "REJECT" | "CHANGES") {
    if (!draft) return;
    const title = decision === "APPROVE" ? "Approve and publish?" : decision === "CHANGES" ? "Request changes?" : "Reject this listing?";
    const body = decision === "APPROVE"
      ? "Guests will be able to find this stay."
      : "The host gets your note by email. Requesting changes sends it back to a draft.";
    confirm.ask(title, body, async () => {
      setError(null);
      await saveListingFn({ data: draft });
      await reviewListing({ data: { propertyId: draft.id, decision, reason: note } });
      const status = decision === "APPROVE" ? "LIVE" : decision === "CHANGES" ? "DRAFT" : "REJECTED";
      setDraft((current) => (current ? { ...current, status, rejectionReason: decision === "APPROVE" ? null : note } : current));
      setEvents((current) => [{ id: `local-${Date.now()}`, action: decision, note, created_at: new Date().toISOString(), actor: "You" }, ...current]);
      toast.success(decision === "APPROVE" ? "Listing is live" : decision === "CHANGES" ? "Changes requested" : "Listing rejected");
    }, decision === "APPROVE" ? "Approve" : decision === "CHANGES" ? "Send note" : "Reject");
  }

  if (error && !draft) return <EmptyState title="Listing didn't open" body={error} />;
  if (!draft) return <Skeleton className="h-40" />;
  const pending = draft.status === "PENDING_REVIEW";

  return (
    <>
      {confirm.dialog}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageIntro title={draft.title} body={`${draft.propertyType.toLowerCase()} · ${draft.status.replaceAll("_", " ").toLowerCase()}`} />
        <StatusPill>{draft.status.replaceAll("_", " ").toLowerCase()}</StatusPill>
      </div>
      <div className="sticky top-0 z-20 mb-6 flex flex-wrap gap-2 rounded-[10px] border border-line bg-white/95 p-2 backdrop-blur">
        <Button type="button" loading={saving} loadingLabel="Saving..." onClick={() => void save()}>Save changes</Button>
        <Button type="button" variant="quiet" onClick={() => setPreview((value) => !value)}>{preview ? "Hide guest preview" : "Preview as guest"}</Button>
        <Button type="button" variant="quiet" disabled={!pending} onClick={() => decide("APPROVE")}>Approve and publish</Button>
        <Button type="button" variant="quiet" disabled={!pending} onClick={() => decide("CHANGES")}>Request changes</Button>
        <Button type="button" variant="danger" disabled={!pending} onClick={() => decide("REJECT")}>Reject</Button>
        {draft.status === "LIVE" ? <Link to="/stay/$slug" params={{ slug: draft.slug }} className="inline-flex h-11 items-center px-3 text-sm text-primary">Open live stay</Link> : null}
      </div>
      {!pending ? <p className="mb-4 text-sm text-muted">Approve, request changes, and reject are for listings waiting on review. You can still edit and save.</p> : null}
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      <div className={preview ? "grid items-start gap-6 lg:grid-cols-2" : "space-y-6"}>
        <div className="space-y-6">
          <FormSection title="Story">
            <SelectField label="Type" value={draft.propertyType} onChange={(propertyType) => patch({ propertyType: propertyType as Draft["propertyType"] })} options={PROPERTY_TYPES.map((type) => ({ value: type.id, label: type.label }))} />
            <SelectField label="Management" value={draft.managementMode} onChange={(managementMode) => patch({ managementMode: managementMode as Draft["managementMode"] })} options={[{ value: "OWNER", label: "Host managed" }, { value: "NESTORA", label: "Nestora managed" }]} />
            <div className="md:col-span-2"><TextField label="Title" value={draft.title} onChange={(title) => patch({ title })} /></div>
            <div className="md:col-span-2"><TextAreaField label="Summary" value={draft.summary} maxLength={280} onChange={(summary) => patch({ summary })} /></div>
            <div className="md:col-span-2"><TextAreaField label="Description" value={draft.description} maxLength={4000} onChange={(description) => patch({ description })} /></div>
          </FormSection>
          <FormSection title="Location">
            <div className="md:col-span-2"><TextField label="Address" value={draft.addressLine} onChange={(addressLine) => patch({ addressLine })} /></div>
            <TextField label="City" value={draft.city} onChange={(city) => patch({ city })} />
            <TextField label="Region" value={draft.region} onChange={(region) => patch({ region })} />
            <TextField label="Postal code" value={draft.postalCode} onChange={(postalCode) => patch({ postalCode })} />
            <TextField label="Country" value={draft.country} onChange={(country) => patch({ country })} />
            <TextField label="Latitude" value={draft.lat == null ? "" : String(draft.lat)} onChange={(value) => patch({ lat: value.trim() ? Number(value) : null })} />
            <TextField label="Longitude" value={draft.lng == null ? "" : String(draft.lng)} onChange={(value) => patch({ lng: value.trim() ? Number(value) : null })} />
            {draft.lat != null && draft.lng != null && Number.isFinite(draft.lat) && Number.isFinite(draft.lng) ? (
              <iframe title="Map" className="h-56 w-full rounded-[10px] border border-line md:col-span-2" src={`https://www.openstreetmap.org/export/embed.html?bbox=${draft.lng - 0.02}%2C${draft.lat - 0.02}%2C${draft.lng + 0.02}%2C${draft.lat + 0.02}&layer=mapnik&marker=${draft.lat}%2C${draft.lng}`} />
            ) : <p className="text-sm text-muted md:col-span-2">Add latitude and longitude to show a pin.</p>}
          </FormSection>
          <FormSection title="Capacity and price">
            <NumberStepper label="Guests" value={draft.maxGuests} min={1} max={100} onChange={(maxGuests) => patch({ maxGuests })} />
            <NumberStepper label="Bedrooms" value={draft.bedrooms} max={50} onChange={(bedrooms) => patch({ bedrooms })} />
            <NumberStepper label="Beds" value={draft.beds} max={100} onChange={(beds) => patch({ beds })} />
            <NumberStepper label="Bathrooms" value={draft.bathrooms} max={50} step={0.5} onChange={(bathrooms) => patch({ bathrooms })} />
            <PriceField label="Nightly" cents={draft.nightlyCents} onChange={(cents) => patch({ nightlyCents: cents ?? 0 })} />
            <PriceField label="Cleaning" cents={draft.cleaningFeeCents} onChange={(cents) => patch({ cleaningFeeCents: cents ?? 0 })} />
            <PriceField label="Security deposit" cents={draft.securityDepositCents} onChange={(cents) => patch({ securityDepositCents: cents ?? 0 })} />
            <PriceField label="Extra guest" cents={draft.extraGuestFeeCents} onChange={(cents) => patch({ extraGuestFeeCents: cents ?? 0 })} />
          </FormSection>
          <FormSection title="Policies">
            <div className="md:col-span-2">
              <ChoiceCards label="Cancellation" value={draft.cancellationPolicy} onChange={(cancellationPolicy) => patch({ cancellationPolicy: cancellationPolicy as Draft["cancellationPolicy"] })} options={[{ value: "FLEXIBLE", label: "Flexible", hint: "Most of the stay is refundable until close to check-in." }, { value: "MODERATE", label: "Moderate", hint: "A partial refund if the guest cancels ahead of time." }, { value: "STRICT", label: "Strict", hint: "A smaller refund, and only when they cancel early." }]} />
            </div>
            <ToggleField label="Smoking" checked={draft.smokingAllowed} onChange={(smokingAllowed) => patch({ smokingAllowed })} />
            <ToggleField label="Parties" checked={draft.partiesAllowed} onChange={(partiesAllowed) => patch({ partiesAllowed })} />
            <ToggleField label="Children" checked={draft.childrenAllowed} onChange={(childrenAllowed) => patch({ childrenAllowed })} />
            <ToggleField label="Pets" checked={draft.petsAllowed} onChange={(petsAllowed) => patch({ petsAllowed })} />
            <div className="md:col-span-2"><TextAreaField label="House rules" value={draft.houseRules} maxLength={4000} onChange={(houseRules) => patch({ houseRules })} /></div>
            <div className="md:col-span-2"><TextField label="3D tour" value={draft.tourUrl ?? ""} onChange={(value) => patch({ tourUrl: value.trim() || null })} /></div>
            <div className="md:col-span-2"><AmenityPicker value={draft.amenities} options={AMENITIES} onChange={(amenities) => patch({ amenities })} /></div>
          </FormSection>
          <FormSection title="Photos and video">
            <div className="md:col-span-2">
              <PhotoGallery items={draft.media.map((item) => ({ id: item.id, url: item.url, kind: item.kind }))} title={draft.title} />
            </div>
            <div className="md:col-span-2">
              <MediaUploader propertyId={draft.id} media={draft.media} onChange={(next) => {
                if ("error" in next) setError(next.error);
                else setDraft((current) => (current ? { ...current, media: next } : current));
              }} />
            </div>
          </FormSection>
          <section className="rounded-card bg-surface p-5 shadow-soft">
            <h2 className="font-display text-2xl">Owner</h2>
            <p className="mt-2 text-sm">{owner?.display_name ?? "Unknown"} · {owner?.email ?? "No email"}{owner?.phone ? ` · ${owner.phone}` : ""}</p>
            <TextAreaField label="Note to the host" value={note} maxLength={500} onChange={setNote} />
          </section>
          <section className="rounded-card bg-surface p-5 shadow-soft">
            <h2 className="font-display text-2xl">Status history</h2>
            {events.length === 0 ? <p className="mt-2 text-sm text-muted">No decisions yet.</p> : null}
            <ul className="mt-3 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="border-t border-line pt-3 text-sm">
                  <p className="font-medium">{event.action.replaceAll("_", " ").toLowerCase()} · {event.actor}</p>
                  <p className="text-muted">{event.created_at.slice(0, 16).replace("T", " ")}{event.note ? ` · ${event.note}` : ""}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {preview ? (
          <aside className="rounded-card bg-white p-5 shadow-soft lg:sticky lg:top-20">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Guest preview</p>
            <h2 className="mt-2 font-display text-3xl">{draft.title}</h2>
            <p className="mt-1 text-sm text-muted">{[draft.city, draft.region, draft.country].filter(Boolean).join(", ")}</p>
            <p className="mt-3 text-sm font-medium tabular-nums">{formatMoney(draft.nightlyCents)} / night</p>
            <PhotoGallery items={draft.media.map((item) => ({ id: item.id, url: item.url, kind: item.kind }))} title={draft.title} />
            {draft.summary ? <p className="mt-4 text-sm">{draft.summary}</p> : null}
            {draft.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{draft.description}</p> : null}
            <p className="mt-4 text-sm">{draft.maxGuests} guests · {draft.bedrooms} bedrooms · {draft.beds} beds · {draft.bathrooms} baths</p>
            <p className="mt-2 text-sm text-muted">Cancellation: {draft.cancellationPolicy.toLowerCase()} · {draft.managementMode === "NESTORA" ? "Nestora managed" : "Host managed"}</p>
          </aside>
        ) : null}
      </div>
    </>
  );
}
