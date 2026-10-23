import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { AMENITIES, type PropertyType } from "./constants.ts";
import { requireActive } from "./data.server.ts";
import { notifyUser } from "./mail.server.ts";

const amenitySet = new Set<string>(AMENITIES);

const draftSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1, "Add a title.").max(120),
  summary: z.string().trim().max(280).default(""),
  description: z.string().trim().max(8000).default(""),
  propertyType: z.enum(["HOTEL", "HOUSE", "APARTMENT", "WAREHOUSE"]),
  addressLine: z.string().trim().max(160).default(""),
  city: z.string().trim().max(80).default(""),
  region: z.string().trim().max(80).default(""),
  postalCode: z.string().trim().max(20).default(""),
  country: z.string().trim().max(80).default(""),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  maxGuests: z.number().int().min(1).max(100),
  bedrooms: z.number().int().min(0).max(50),
  beds: z.number().int().min(0).max(100),
  bathrooms: z.number().min(0).max(50),
  petsAllowed: z.boolean(),
  maxPets: z.number().int().min(0).max(10),
  petFeeCents: z.number().int().min(0).max(50_000_000),
  instantBook: z.boolean(),
  managementMode: z.enum(["OWNER", "NESTORA"]).default("OWNER"),
  nightlyCents: z.number().int().min(0).max(50_000_000),
  weekendCents: z.number().int().min(0).max(50_000_000).nullable(),
  weeklyDiscountBps: z.number().int().min(0).max(10_000),
  monthlyDiscountBps: z.number().int().min(0).max(10_000),
  securityDepositCents: z.number().int().min(0).max(50_000_000),
  extraGuestFeeCents: z.number().int().min(0).max(50_000_000),
  includedGuests: z.number().int().min(1).max(100),
  cleaningFeeCents: z.number().int().min(0).max(50_000_000),
  minNights: z.number().int().min(1).max(365),
  maxNights: z.number().int().min(1).max(365).nullable(),
  starRating: z.number().int().min(1).max(5).nullable(),
  floorSqm: z.number().min(0).max(1_000_000).nullable(),
  ceilingM: z.number().min(0).max(100).nullable(),
  loadingDocks: z.number().int().min(0).max(100),
  truckParking: z.number().int().min(0).max(500),
  checkInTime: z.string().trim().max(8),
  checkOutTime: z.string().trim().max(8),
  cancellationPolicy: z.enum(["FLEXIBLE", "MODERATE", "STRICT"]),
  smokingAllowed: z.boolean(),
  partiesAllowed: z.boolean(),
  childrenAllowed: z.boolean(),
  quietHours: z.string().trim().max(80).default(""),
  houseRules: z.string().trim().max(4000).default(""),
  checkInInstructions: z.string().trim().max(4000).default(""),
  videoUrl: z.string().trim().max(400).nullable(),
  tourUrl: z.string().trim().max(400).nullable(),
  amenities: z.array(z.string()).max(24),
  rooms: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    quantity: z.number().int().min(1).max(500),
    nightlyCents: z.number().int().min(0).max(50_000_000),
    maxGuests: z.number().int().min(1).max(50),
    beds: z.number().int().min(0).max(20),
    description: z.string().trim().max(500).default(""),
  })).max(40),
  seasons: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().trim().min(1).max(80),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nightlyCents: z.number().int().min(0).max(50_000_000),
  })).max(24),
});

export type ListingDraft = z.infer<typeof draftSchema> & {
  slug: string;
  status: string;
  rejectionReason: string | null;
  media: { id: string; kind: string; url: string; sortOrder: number; isCover: boolean }[];
};

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return parsed.data;
}

function httpsOrNull(value: string | null, label: string): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a full https address.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must start with https://`);
  return url.toString();
}

async function owned(userId: string, propertyId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ owner_user_id: string; status: string }>`
    select owner_user_id, status from properties where id = ${propertyId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Listing not found.");
  if (row.owner_user_id !== profile.userId && profile.role !== "ADMIN") {
    throw new Error("That listing is not yours.");
  }
  return { profile, status: row.status, sql };
}

export async function createListing(userId: string, propertyType: PropertyType) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const caps = await sql<{ max_properties: number | null }>`
    select max_properties from profiles where user_id = ${profile.userId}
  `;
  const cap = caps[0]?.max_properties;
  if (cap != null) {
    const counts = await sql<{ n: number }>`
      select count(*)::int as n from properties where owner_user_id = ${profile.userId}
    `;
    if ((counts[0]?.n ?? 0) >= cap) {
      throw new Error(`This account can have up to ${cap} properties. Ask Nestora if you need a higher limit.`);
    }
  }
  const id = randomUUID();
  const slug = `draft-${id.slice(0, 8)}`;
  await sql`
    insert into properties (id, owner_user_id, property_type, title, slug, status)
    values (${id}, ${profile.userId}, ${propertyType}, 'Untitled stay', ${slug}, 'DRAFT')
  `;
  return loadOwnListing(userId, id);
}

export async function loadOwnListing(userId: string, propertyId: string): Promise<ListingDraft> {
  const { sql } = await owned(userId, propertyId);
  const rows = await sql<Record<string, unknown>>`
    select * from properties where id = ${propertyId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Listing not found.");
  const media = await sql<{ id: string; kind: string; url: string; sort_order: number; is_cover: boolean }>`
    select id, kind, url, sort_order, is_cover from property_media
    where property_id = ${propertyId}
    order by sort_order asc, created_at asc
  `;
  const rooms = await sql<{
    id: string; name: string; quantity: number; nightly_cents: number; max_guests: number; beds: number; description: string;
  }>`
    select id, name, quantity, nightly_cents, max_guests, beds, description
    from rooms where property_id = ${propertyId} order by name
  `;
  const seasons = await sql<{ id: string; label: string; starts_on: string; ends_on: string; nightly_cents: number }>`
    select id, label, starts_on::text as starts_on, ends_on::text as ends_on, nightly_cents
    from seasonal_rates where property_id = ${propertyId} order by starts_on
  `;
  const amenities = Array.isArray(row.amenities) ? row.amenities.map(String).filter((item) => amenitySet.has(item)) : [];
  return {
    id: String(row.id),
    slug: String(row.slug),
    status: String(row.status),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    description: String(row.description ?? ""),
    propertyType: row.property_type as PropertyType,
    addressLine: String(row.address_line ?? ""),
    city: String(row.city ?? ""),
    region: String(row.region ?? ""),
    postalCode: String(row.postal_code ?? ""),
    country: String(row.country ?? ""),
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    maxGuests: Number(row.max_guests),
    bedrooms: Number(row.bedrooms),
    beds: Number(row.beds),
    bathrooms: Number(row.bathrooms),
    petsAllowed: Boolean(row.pets_allowed),
    maxPets: Number(row.max_pets),
    petFeeCents: Number(row.pet_fee_cents),
    instantBook: Boolean(row.instant_book),
    managementMode: row.management_mode === "NESTORA" ? "NESTORA" : "OWNER",
    nightlyCents: Number(row.nightly_cents),
    weekendCents: row.weekend_cents == null ? null : Number(row.weekend_cents),
    weeklyDiscountBps: Number(row.weekly_discount_bps),
    monthlyDiscountBps: Number(row.monthly_discount_bps),
    securityDepositCents: Number(row.security_deposit_cents),
    extraGuestFeeCents: Number(row.extra_guest_fee_cents),
    includedGuests: Number(row.included_guests),
    cleaningFeeCents: Number(row.cleaning_fee_cents),
    minNights: Number(row.min_nights ?? 1),
    maxNights: row.max_nights == null ? null : Number(row.max_nights),
    starRating: row.star_rating == null ? null : Number(row.star_rating),
    floorSqm: row.floor_sqm == null ? null : Number(row.floor_sqm),
    ceilingM: row.ceiling_m == null ? null : Number(row.ceiling_m),
    loadingDocks: Number(row.loading_docks ?? 0),
    truckParking: Number(row.truck_parking ?? 0),
    checkInTime: String(row.check_in_time ?? "15:00"),
    checkOutTime: String(row.check_out_time ?? "11:00"),
    cancellationPolicy: String(row.cancellation_policy ?? "MODERATE") as "FLEXIBLE" | "MODERATE" | "STRICT",
    smokingAllowed: Boolean(row.smoking_allowed),
    partiesAllowed: Boolean(row.parties_allowed),
    childrenAllowed: Boolean(row.children_allowed),
    quietHours: String(row.quiet_hours ?? ""),
    houseRules: String(row.house_rules ?? ""),
    checkInInstructions: String(row.check_in_instructions ?? ""),
    videoUrl: row.video_url == null ? null : String(row.video_url),
    tourUrl: row.tour_url == null ? null : String(row.tour_url),
    amenities,
    rejectionReason: row.rejection_reason == null ? null : String(row.rejection_reason),
    media: media.map((item) => ({
      id: item.id,
      kind: item.kind,
      url: item.url,
      sortOrder: item.sort_order,
      isCover: item.is_cover,
    })),
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      quantity: room.quantity,
      nightlyCents: room.nightly_cents,
      maxGuests: room.max_guests,
      beds: room.beds,
      description: room.description,
    })),
    seasons: seasons.map((season) => ({
      id: season.id,
      label: season.label,
      startsOn: season.starts_on,
      endsOn: season.ends_on,
      nightlyCents: season.nightly_cents,
    })),
  };
}

function slugify(title: string, id: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "stay"}-${id.slice(0, 8)}`;
}

export async function saveListingDraft(userId: string, input: unknown) {
  const draft = parse(draftSchema, input);
  if (draft.maxNights != null && draft.maxNights < draft.minNights) {
    throw new Error("Maximum stay cannot be shorter than the minimum.");
  }
  const { profile, status, sql } = await owned(userId, draft.id);
  if (status === "PENDING_REVIEW" && profile.role !== "ADMIN") throw new Error("This listing is in review. Wait for a decision before editing.");
  const videoUrl = httpsOrNull(draft.videoUrl, "Video");
  const tourUrl = httpsOrNull(draft.tourUrl, "Virtual tour");
  const amenities = draft.amenities.filter((item) => amenitySet.has(item));
  const slug = slugify(draft.title, draft.id);
  const nextStatus = status === "LIVE" || status === "PAUSED" ? status : status === "REJECTED" ? "DRAFT" : status;
  await sql`
    update properties set
      title = ${draft.title},
      slug = ${slug},
      summary = ${draft.summary},
      description = ${draft.description},
      property_type = ${draft.propertyType},
      address_line = ${draft.addressLine},
      city = ${draft.city},
      region = ${draft.region},
      postal_code = ${draft.postalCode},
      country = ${draft.country},
      lat = ${draft.lat},
      lng = ${draft.lng},
      max_guests = ${draft.maxGuests},
      bedrooms = ${draft.bedrooms},
      beds = ${draft.beds},
      bathrooms = ${draft.bathrooms},
      pets_allowed = ${draft.petsAllowed},
      max_pets = ${draft.maxPets},
      pet_fee_cents = ${draft.petFeeCents},
      instant_book = ${draft.instantBook},
      management_mode = ${draft.managementMode},
      nightly_cents = ${draft.nightlyCents},
      weekend_cents = ${draft.weekendCents},
      weekly_discount_bps = ${draft.weeklyDiscountBps},
      monthly_discount_bps = ${draft.monthlyDiscountBps},
      security_deposit_cents = ${draft.securityDepositCents},
      extra_guest_fee_cents = ${draft.extraGuestFeeCents},
      included_guests = ${draft.includedGuests},
      cleaning_fee_cents = ${draft.cleaningFeeCents},
      min_nights = ${draft.minNights},
      max_nights = ${draft.maxNights},
      star_rating = ${draft.starRating},
      floor_sqm = ${draft.floorSqm},
      ceiling_m = ${draft.ceilingM},
      loading_docks = ${draft.loadingDocks},
      truck_parking = ${draft.truckParking},
      check_in_time = ${draft.checkInTime},
      check_out_time = ${draft.checkOutTime},
      cancellation_policy = ${draft.cancellationPolicy},
      smoking_allowed = ${draft.smokingAllowed},
      parties_allowed = ${draft.partiesAllowed},
      children_allowed = ${draft.childrenAllowed},
      quiet_hours = ${draft.quietHours},
      house_rules = ${draft.houseRules},
      check_in_instructions = ${draft.checkInInstructions},
      video_url = ${videoUrl},
      tour_url = ${tourUrl},
      amenities = ${amenities},
      status = ${nextStatus},
      updated_at = now()
    where id = ${draft.id}
  `;
  await sql`delete from rooms where property_id = ${draft.id}`;
  for (const room of draft.rooms) {
    await sql`
      insert into rooms (id, property_id, name, quantity, nightly_cents, max_guests, beds, description)
      values (${room.id}, ${draft.id}, ${room.name}, ${room.quantity}, ${room.nightlyCents}, ${room.maxGuests}, ${room.beds}, ${room.description})
    `;
  }
  await sql`delete from seasonal_rates where property_id = ${draft.id}`;
  for (const season of draft.seasons) {
    if (season.endsOn < season.startsOn) throw new Error(`Season “${season.label}” ends before it starts.`);
    await sql`
      insert into seasonal_rates (id, property_id, label, starts_on, ends_on, nightly_cents)
      values (${season.id}, ${draft.id}, ${season.label}, ${season.startsOn}, ${season.endsOn}, ${season.nightlyCents})
    `;
  }
  if (profile.role === "ADMIN") {
    const { writeAudit } = await import("./audit.server.ts");
    await writeAudit(profile.userId, "listing.edit", draft.id, {
      title: draft.title,
      nightlyCents: draft.nightlyCents,
      city: draft.city,
      status,
    });
    await sql`
      insert into listing_events (id, property_id, actor_user_id, action, note)
      values (${randomUUID()}, ${draft.id}, ${profile.userId}, 'EDIT', ${`Saved ${draft.title}`})
    `;
  }
  return loadOwnListing(userId, draft.id);
}

export async function submitListing(userId: string, propertyId: string) {
  const listing = await loadOwnListing(userId, propertyId);
  if (listing.title === "Untitled stay" || listing.nightlyCents <= 0) {
    throw new Error("Add a real title and a nightly price before sending this for review.");
  }
  if (!listing.city || !listing.country) throw new Error("Add a city and country before sending this for review.");
  if (listing.media.filter((item) => item.kind === "IMAGE").length === 0) {
    throw new Error("Add at least one photo before sending this for review.");
  }
  const sql = await getSql();
  await sql`
    update properties
    set status = 'PENDING_REVIEW', rejection_reason = null, updated_at = now()
    where id = ${propertyId}
  `;
  const admins = await sql<{ user_id: string; email: string; email_bookings: boolean }>`
    select p.user_id, u.email, p.email_bookings
    from profiles p join "user" u on u.id = p.user_id
    where p.role = 'ADMIN' and p.account_status = 'ACTIVE'
  `;
  for (const admin of admins) {
    await notifyUser({
      userId: admin.user_id,
      email: admin.email,
      emailOn: admin.email_bookings,
      template: "listing-submitted",
      title: `Listing to review: ${listing.title}`,
      body: `${listing.title} in ${listing.city} is waiting for a decision.`,
      href: `/admin/review/${propertyId}`,
    });
  }
  await sql`
    insert into listing_events (id, property_id, actor_user_id, action, note)
    values (${randomUUID()}, ${propertyId}, ${userId}, 'SUBMIT', ${listing.title})
  `;
  return loadOwnListing(userId, propertyId);
}

export async function addMediaUrl(
  userId: string,
  propertyId: string,
  url: string,
  kind: "IMAGE" | "VIDEO",
  publicId: string | null = null,
) {
  if (!url.startsWith("data:image/") && !url.startsWith("/stays/")) {
    httpsOrNull(url, kind === "IMAGE" ? "Photo" : "Video");
  }
  const { sql } = await owned(userId, propertyId);
  const count = await sql<{ n: number }>`select count(*)::int as n from property_media where property_id = ${propertyId}`;
  const id = randomUUID();
  const isCover = kind === "IMAGE" && (count[0]?.n ?? 0) === 0;
  await sql`
    insert into property_media (id, property_id, kind, url, public_id, sort_order, is_cover)
    values (${id}, ${propertyId}, ${kind}, ${url}, ${publicId}, ${count[0]?.n ?? 0}, ${isCover})
  `;
  return loadOwnListing(userId, propertyId);
}

export async function saveMediaOrder(userId: string, propertyId: string, ids: string[], coverId: string | null) {
  const { sql } = await owned(userId, propertyId);
  await sql.transaction(async (tx: Sql) => {
    await tx`update property_media set is_cover = false where property_id = ${propertyId}`;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]!;
      await tx`
        update property_media
        set sort_order = ${index}, is_cover = ${id === coverId}
        where id = ${id} and property_id = ${propertyId}
      `;
    }
  });
  return loadOwnListing(userId, propertyId);
}

export async function removeMedia(userId: string, propertyId: string, mediaId: string) {
  const { sql } = await owned(userId, propertyId);
  await sql`delete from property_media where id = ${mediaId} and property_id = ${propertyId}`;
  return loadOwnListing(userId, propertyId);
}

export async function loadOwnerCalendar(userId: string, propertyId: string, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Use a YYYY-MM month.");
  await owned(userId, propertyId);
  const sql = await getSql();
  const start = `${month}-01`;
  const days = await sql<{ day: string; price_cents: number | null; blocked: boolean }>`
    select day::text as day, price_cents, blocked
    from calendar_days
    where property_id = ${propertyId} and room_id = ''
      and day >= ${start}::date
      and day < (${start}::date + interval '1 month')
  `;
  const bookings = await sql<{ id: string; status: string; check_in: string; check_out: string }>`
    select id, status, check_in::text as check_in, check_out::text as check_out
    from bookings
    where property_id = ${propertyId}
      and status in ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
      and check_out > ${start}::date
      and check_in < (${start}::date + interval '1 month')
  `;
  return { days, bookings };
}

export async function setCalendarDay(
  userId: string,
  input: { propertyId: string; day: string; blocked: boolean; priceCents: number | null },
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new Error("Use a YYYY-MM-DD date.");
  if (input.priceCents != null && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) {
    throw new Error("Custom price must be zero or more cents.");
  }
  const { sql } = await owned(userId, input.propertyId);
  await sql`
    insert into calendar_days (property_id, room_id, day, price_cents, blocked)
    values (${input.propertyId}, '', ${input.day}, ${input.priceCents}, ${input.blocked})
    on conflict (property_id, room_id, day)
    do update set price_cents = excluded.price_cents, blocked = excluded.blocked
  `;
  return { ok: true as const };
}

export async function loadListingReview(userId: string, propertyId: string) {
  await requireActive(userId, ["ADMIN"]);
  const listing = await loadOwnListing(userId, propertyId);
  const sql = await getSql();
  const owners = await sql<{ display_name: string; email: string; phone: string | null }>`
    select pr.display_name, u.email, pr.phone
    from properties p
    join profiles pr on pr.user_id = p.owner_user_id
    join "user" u on u.id = p.owner_user_id
    where p.id = ${propertyId}
  `;
  const events = await sql<{ id: string; action: string; note: string; created_at: string; actor: string }>`
    select e.id, e.action, e.note, e.created_at::text as created_at,
           coalesce(pr.display_name, 'Nestora') as actor
    from listing_events e
    left join profiles pr on pr.user_id = e.actor_user_id
    where e.property_id = ${propertyId}
    order by e.created_at desc
    limit 40
  `;
  return { listing, owner: owners[0] ?? null, events };
}

export async function listDestinations() {
  const { ensureDemoCatalog } = await import("./demo.server.ts");
  await ensureDemoCatalog();
  const sql = await getSql();
  return sql<{ city: string; country: string; stays: number }>`
    select city, country, count(*)::int as stays
    from properties
    where status = 'LIVE' and city <> ''
    group by city, country
    order by stays desc, city asc
    limit 6
  `;
}
