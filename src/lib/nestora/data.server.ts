import { getSql } from "@/lib/db";
import { AMENITIES, type PropertyType, type Role } from "./constants.ts";
import { ownerNet } from "@/lib/domain/pricing.ts";

const AMENITY_SET = new Set<string>(AMENITIES);

export type Profile = {
  userId: string;
  email: string;
  displayName: string;
  phone: string | null;
  role: Role;
  accountStatus: "ACTIVE" | "SUSPENDED";
  ownerStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  ownerNote: string | null;
};

export type RefundRuleView = { minHoursBeforeCheckIn: number; refundBps: number };

export type SettingsView = {
  subscriptionEnabled: boolean;
  subscriptionAmountCents: number;
  commissionEnabled: boolean;
  commissionType: "FIXED" | "PERCENT";
  commissionFixedCents: number;
  commissionBps: number;
  managedCleaningFeeCents: number;
  managedManagementBps: number;
  managedLinenFeeCents: number;
  managedMaintenanceCents: number;
  managedCustomFees: { name: string; cents: number }[];
  taxBps: number;
  serviceFeeBps: number;
  currency: string;
  policies: {
    code: string;
    name: string;
    summary: string;
    rules: RefundRuleView[];
  }[];
};

export type StayCard = {
  id: string;
  slug: string;
  title: string;
  propertyType: PropertyType;
  city: string;
  region: string;
  country: string;
  summary: string;
  nightlyCents: number;
  maxGuests: number;
  bedrooms: number;
  instantBook: boolean;
  petsAllowed: boolean;
  avgRating: number;
  reviewCount: number;
  coverUrl: string | null;
};

export type SearchInput = {
  location: string;
  type: "" | PropertyType;
  minCents: number | null;
  maxCents: number | null;
  guests: number;
  bedrooms: number;
  pets: boolean;
  instant: boolean;
  minRating: number;
  amenities: string[];
  sort: "newest" | "price_asc" | "price_desc" | "rating";
};

type ProfileRow = {
  user_id: string;
  email: string;
  display_name: string;
  phone: string | null;
  role: string;
  account_status: string;
  owner_status: string;
  owner_note: string | null;
};

const buckets = new Map<string, number[]>();

function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

function asRole(value: string): Role {
  if (value === "OWNER" || value === "ADMIN") return value;
  return "CUSTOMER";
}

function mapProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    phone: row.phone,
    role: asRole(row.role),
    accountStatus: row.account_status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
    ownerStatus:
      row.owner_status === "PENDING" ||
      row.owner_status === "APPROVED" ||
      row.owner_status === "REJECTED" ||
      row.owner_status === "SUSPENDED"
        ? row.owner_status
        : "NONE",
    ownerNote: row.owner_note,
  };
}

async function readProfile(userId: string): Promise<Profile> {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select p.user_id, u.email, p.display_name, p.phone, p.role, p.account_status,
           p.owner_status, p.owner_note
    from profiles p
    join "user" u on u.id = p.user_id
    where p.user_id = ${userId}
  `;
  const row = rows[0];
  if (!row) throw new Error("Account not found");
  return mapProfile(row);
}

export async function loadOrCreateProfile(userId: string): Promise<Profile> {
  const sql = await getSql();
  const users = await sql<{ id: string; name: string; email: string }>`
    select id, name, email from "user" where id = ${userId}
  `;
  const user = users[0];
  if (!user) throw new Error("Sign in again to continue.");

  await sql`
    insert into profiles (user_id, display_name, role)
    values (${userId}, ${user.name?.trim() || "Guest"}, 'CUSTOMER')
    on conflict (user_id) do nothing
  `;

  const configured = (process.env.NESTORA_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length > 0) {
    if (configured.includes(user.email.toLowerCase())) {
      await sql`
        update profiles set role = 'ADMIN', updated_at = now()
        where user_id = ${userId} and role <> 'ADMIN'
      `;
    }
  } else {
    const won = await sql<{ founder_user_id: string }>`
      update platform_lock
      set founder_user_id = ${userId}
      where id = 1 and founder_user_id is null
      returning founder_user_id
    `;
    if (won.length > 0) {
      await sql`
        update profiles set role = 'ADMIN', updated_at = now() where user_id = ${userId}
      `;
    }
  }

  return readProfile(userId);
}

export async function requireActive(userId: string, roles?: Role[]): Promise<Profile> {
  const profile = await loadOrCreateProfile(userId);
  if (profile.accountStatus === "SUSPENDED") {
    throw new Error("This account is suspended.");
  }
  if (roles && !roles.includes(profile.role)) {
    throw new Error("You don't have access to that.");
  }
  return profile;
}

export async function updateOwnProfile(
  userId: string,
  input: { displayName: string; phone: string },
): Promise<Profile> {
  await requireActive(userId);
  const sql = await getSql();
  const phone = input.phone.trim() ? input.phone.trim() : null;
  await sql`
    update profiles
    set display_name = ${input.displayName.trim()}, phone = ${phone}, updated_at = now()
    where user_id = ${userId}
  `;
  return readProfile(userId);
}

export async function requestOwnerAccess(userId: string, note: string): Promise<Profile> {
  if (!rateLimit(`owner:${userId}`, 5, 60 * 60 * 1000)) {
    throw new Error("Too many requests. Try again in a little while.");
  }
  const profile = await requireActive(userId);
  if (profile.role === "ADMIN" || profile.role === "OWNER") return profile;
  if (profile.ownerStatus === "PENDING") return profile;
  const sql = await getSql();
  await sql`
    update profiles
    set owner_status = 'PENDING', owner_note = ${note.trim() || null}, updated_at = now()
    where user_id = ${userId} and role = 'CUSTOMER'
  `;
  return readProfile(userId);
}

function asCustomFees(value: unknown): { name: string; cents: number }[] {
  if (!Array.isArray(value)) return [];
  const fees: { name: string; cents: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.cents !== "number") continue;
    fees.push({ name: record.name, cents: record.cents });
  }
  return fees;
}

function asRules(value: unknown): RefundRuleView[] {
  if (!Array.isArray(value)) return [];
  const rules: RefundRuleView[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.minHoursBeforeCheckIn !== "number" || typeof record.refundBps !== "number") {
      continue;
    }
    rules.push({
      minHoursBeforeCheckIn: record.minHoursBeforeCheckIn,
      refundBps: record.refundBps,
    });
  }
  return rules;
}

export async function readSettings(): Promise<SettingsView> {
  const sql = await getSql();
  const rows = await sql<{
    subscription_enabled: boolean;
    subscription_amount_cents: number;
    commission_enabled: boolean;
    commission_type: string;
    commission_fixed_cents: number;
    commission_bps: number;
    managed_cleaning_fee_cents: number;
    managed_management_bps: number;
    managed_linen_fee_cents: number;
    managed_maintenance_cents: number;
    managed_custom_fees: unknown;
    tax_bps: number;
    service_fee_bps: number;
    currency: string;
  }>`select * from platform_settings where id = 1`;
  const row = rows[0];
  if (!row) throw new Error("Platform settings are missing.");
  const policies = await sql<{
    code: string;
    name: string;
    summary: string;
    rules: unknown;
  }>`select code, name, summary, rules from cancellation_policies order by code`;
  return {
    subscriptionEnabled: row.subscription_enabled,
    subscriptionAmountCents: row.subscription_amount_cents,
    commissionEnabled: row.commission_enabled,
    commissionType: row.commission_type === "FIXED" ? "FIXED" : "PERCENT",
    commissionFixedCents: row.commission_fixed_cents,
    commissionBps: row.commission_bps,
    managedCleaningFeeCents: row.managed_cleaning_fee_cents,
    managedManagementBps: row.managed_management_bps,
    managedLinenFeeCents: row.managed_linen_fee_cents,
    managedMaintenanceCents: row.managed_maintenance_cents,
    managedCustomFees: asCustomFees(row.managed_custom_fees),
    taxBps: row.tax_bps,
    serviceFeeBps: row.service_fee_bps,
    currency: row.currency,
    policies: policies.map((policy) => ({
      code: policy.code,
      name: policy.name,
      summary: policy.summary,
      rules: asRules(policy.rules),
    })),
  };
}

type CardRow = {
  id: string;
  slug: string;
  title: string;
  property_type: string;
  city: string;
  region: string;
  country: string;
  summary: string;
  nightly_cents: number;
  max_guests: number;
  bedrooms: number;
  instant_book: boolean;
  pets_allowed: boolean;
  avg_rating: number;
  review_count: number;
  cover_url: string | null;
};

function mapCard(row: CardRow): StayCard {
  const propertyType = (
    ["HOTEL", "HOUSE", "APARTMENT", "WAREHOUSE"] as const
  ).includes(row.property_type as PropertyType)
    ? (row.property_type as PropertyType)
    : "HOUSE";
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    propertyType,
    city: row.city,
    region: row.region,
    country: row.country,
    summary: row.summary,
    nightlyCents: row.nightly_cents,
    maxGuests: row.max_guests,
    bedrooms: row.bedrooms,
    instantBook: row.instant_book,
    petsAllowed: row.pets_allowed,
    avgRating: Number(row.avg_rating) || 0,
    reviewCount: row.review_count,
    coverUrl: row.cover_url,
  };
}

export async function searchStays(input: SearchInput): Promise<StayCard[]> {
  const sql = await getSql();
  const where = ["p.status = 'LIVE'"];
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const location = input.location.trim();
  if (location) {
    const pattern = `%${location.replace(/[\\%_]/g, "\\$&")}%`;
    const token = add(pattern);
    where.push(
      `(p.city ilike ${token} escape '\\' or p.region ilike ${token} escape '\\' or p.country ilike ${token} escape '\\' or p.title ilike ${token} escape '\\')`,
    );
  }
  if (input.type) where.push(`p.property_type = ${add(input.type)}`);
  if (input.minCents != null) where.push(`p.nightly_cents >= ${add(input.minCents)}`);
  if (input.maxCents != null) where.push(`p.nightly_cents <= ${add(input.maxCents)}`);
  if (input.guests > 0) where.push(`p.max_guests >= ${add(input.guests)}`);
  if (input.bedrooms > 0) where.push(`p.bedrooms >= ${add(input.bedrooms)}`);
  if (input.pets) where.push("p.pets_allowed = true");
  if (input.instant) where.push("p.instant_book = true");
  if (input.minRating > 0) where.push(`coalesce(rv.avg_rating, 0) >= ${add(input.minRating)}`);
  for (const amenity of input.amenities) {
    if (AMENITY_SET.has(amenity)) where.push(`${add(amenity)} = any(p.amenities)`);
  }

  const order = {
    newest: "p.created_at desc",
    price_asc: "p.nightly_cents asc, p.created_at desc",
    price_desc: "p.nightly_cents desc, p.created_at desc",
    rating: "coalesce(rv.avg_rating, 0) desc, p.created_at desc",
  }[input.sort];

  const text = `
    select p.id, p.slug, p.title, p.property_type, p.city, p.region, p.country,
           p.summary, p.nightly_cents, p.max_guests, p.bedrooms, p.instant_book,
           p.pets_allowed,
           coalesce(rv.avg_rating, 0)::float8 as avg_rating,
           coalesce(rv.review_count, 0)::int as review_count,
           (
             select m.url from property_media m
             where m.property_id = p.id and m.kind = 'IMAGE'
             order by m.sort_order asc, m.created_at asc
             limit 1
           ) as cover_url
    from properties p
    left join (
      select property_id,
             avg(rating)::float8 as avg_rating,
             count(*)::int as review_count
      from reviews
      group by property_id
    ) rv on rv.property_id = p.id
    where ${where.join(" and ")}
    order by ${order}
    limit 48
  `;
  const rows = await sql.query<CardRow>(text, params);
  return rows.map(mapCard);
}

export async function customerSummary(userId: string) {
  await requireActive(userId);
  const sql = await getSql();
  const rows = await sql<{
    upcoming: number;
    past: number;
    cancelled: number;
    saved: number;
    cards: number;
  }>`
    select
      (select count(*) from bookings
        where customer_user_id = ${userId}
          and status in ('PENDING', 'CONFIRMED', 'CHECKED_IN')
          and check_out >= current_date)::int as upcoming,
      (select count(*) from bookings
        where customer_user_id = ${userId} and status = 'COMPLETED')::int as past,
      (select count(*) from bookings
        where customer_user_id = ${userId}
          and status in ('CANCELLED', 'REFUNDED'))::int as cancelled,
      (select count(*) from saved_properties where user_id = ${userId})::int as saved,
      (select count(*) from payment_methods where user_id = ${userId})::int as cards
  `;
  return rows[0]!;
}

export async function ownerSummary(userId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const ownerId = profile.role === "ADMIN" ? userId : userId;
  const rows = await sql<{
    views: number;
    bookings: number;
    current_stays: number;
    upcoming: number;
    properties: number;
    revenue_cents: number;
  }>`
    select
      (select coalesce(sum(v.view_count), 0)::int
        from property_views v
        join properties p on p.id = v.property_id
        where p.owner_user_id = ${ownerId}) as views,
      (select count(*)::int from bookings b
        join properties p on p.id = b.property_id
        where p.owner_user_id = ${ownerId}) as bookings,
      (select count(*)::int from bookings b
        join properties p on p.id = b.property_id
        where p.owner_user_id = ${ownerId}
          and b.status in ('CONFIRMED', 'CHECKED_IN')
          and b.check_in <= current_date
          and b.check_out > current_date) as current_stays,
      (select count(*)::int from bookings b
        join properties p on p.id = b.property_id
        where p.owner_user_id = ${ownerId}
          and b.status in ('PENDING', 'CONFIRMED')
          and b.check_in > current_date) as upcoming,
      (select count(*)::int from properties where owner_user_id = ${ownerId}) as properties,
      (select coalesce(sum(b.total_cents), 0)::int from bookings b
        join properties p on p.id = b.property_id
        where p.owner_user_id = ${ownerId}
          and b.status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')) as revenue_cents
  `;
  const revenue = rows[0]!.revenue_cents;
  const settings = await readSettings();
  const net = ownerNet({
    accommodationCents: revenue,
    cleaningFeeCents: 0,
    commissionEnabled: settings.commissionEnabled,
    commissionType: settings.commissionType,
    commissionFixedCents: settings.commissionFixedCents,
    commissionBps: settings.commissionBps,
    managed: null,
  });
  return { ...rows[0]!, estimatedNetCents: net.netCents };
}

export async function adminSummary(userId: string) {
  await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{
    bookings: number;
    guest_payments_cents: number;
    owners: number;
    pending_listings: number;
    pending_owners: number;
    customers: number;
  }>`
    select
      (select count(*)::int from bookings) as bookings,
      (select coalesce(sum(amount_cents), 0)::int from payments where status = 'SUCCEEDED') as guest_payments_cents,
      (select count(*)::int from profiles where role = 'OWNER') as owners,
      (select count(*)::int from properties where status = 'PENDING_REVIEW') as pending_listings,
      (select count(*)::int from profiles where owner_status = 'PENDING') as pending_owners,
      (select count(*)::int from profiles where role = 'CUSTOMER') as customers
  `;
  const founder = await sql<{ founder_user_id: string | null }>`
    select founder_user_id from platform_lock where id = 1
  `;
  return { ...rows[0]!, founderUserId: founder[0]?.founder_user_id ?? null };
}

export type PersonRow = {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  accountStatus: "ACTIVE" | "SUSPENDED";
  ownerStatus: Profile["ownerStatus"];
  ownerNote: string | null;
};

export async function listPeople(actorId: string): Promise<PersonRow[]> {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select p.user_id, u.email, p.display_name, p.phone, p.role, p.account_status,
           p.owner_status, p.owner_note
    from profiles p
    join "user" u on u.id = p.user_id
    order by p.created_at desc
  `;
  return rows.map(mapProfile);
}

export async function decideAccount(
  actorId: string,
  input: { userId: string; decision: "APPROVE" | "REJECT" | "SUSPEND" | "RESTORE"; note: string },
): Promise<void> {
  if (!rateLimit(`decide:${actorId}`, 30, 60 * 60 * 1000)) {
    throw new Error("Too many changes. Try again in a little while.");
  }
  const actor = await requireActive(actorId, ["ADMIN"]);
  if (input.userId === actor.userId && input.decision === "SUSPEND") {
    throw new Error("You can't suspend your own operator account.");
  }
  const sql = await getSql();
  if (input.decision === "SUSPEND") {
    const admins = await sql<{ user_id: string }>`
      select user_id from profiles
      where role = 'ADMIN' and account_status = 'ACTIVE'
    `;
    if (admins.length === 1 && admins[0]!.user_id === input.userId) {
      throw new Error("Keep at least one active operator.");
    }
    await sql`
      update profiles
      set account_status = 'SUSPENDED', updated_at = now()
      where user_id = ${input.userId}
    `;
    return;
  }
  if (input.decision === "RESTORE") {
    await sql`
      update profiles
      set account_status = 'ACTIVE', updated_at = now()
      where user_id = ${input.userId}
    `;
    return;
  }
  if (input.decision === "APPROVE") {
    await sql`
      update profiles
      set role = case when role = 'ADMIN' then 'ADMIN' else 'OWNER' end,
          owner_status = 'APPROVED',
          account_status = 'ACTIVE',
          owner_note = ${input.note.trim() || null},
          owner_reviewed_at = now(),
          updated_at = now()
      where user_id = ${input.userId}
    `;
    return;
  }
  await sql`
    update profiles
    set owner_status = 'REJECTED',
        owner_note = ${input.note.trim() || null},
        owner_reviewed_at = now(),
        updated_at = now()
    where user_id = ${input.userId} and owner_status = 'PENDING'
  `;
}

export async function listMyBookings(userId: string) {
  await requireActive(userId);
  const sql = await getSql();
  return sql<{
    id: string;
    status: string;
    check_in: string;
    check_out: string;
    total_cents: number;
    currency: string;
    title: string;
    slug: string;
    city: string;
  }>`
    select b.id, b.status, b.check_in::text as check_in, b.check_out::text as check_out,
           b.total_cents, b.currency, p.title, p.slug, p.city
    from bookings b
    join properties p on p.id = b.property_id
    where b.customer_user_id = ${userId}
    order by b.check_in desc
  `;
}

export async function listSavedCards(userId: string) {
  await requireActive(userId);
  const sql = await getSql();
  return sql<{
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    is_default: boolean;
  }>`
    select id, brand, last4, exp_month, exp_year, is_default
    from payment_methods
    where user_id = ${userId}
    order by is_default desc, created_at desc
  `;
}

export async function listSavedStays(userId: string) {
  await requireActive(userId);
  const sql = await getSql();
  const rows = await sql<CardRow>`
    select p.id, p.slug, p.title, p.property_type, p.city, p.region, p.country,
           p.summary, p.nightly_cents, p.max_guests, p.bedrooms, p.instant_book,
           p.pets_allowed, 0::float8 as avg_rating, 0::int as review_count, null::text as cover_url
    from saved_properties s
    join properties p on p.id = s.property_id
    where s.user_id = ${userId}
    order by s.created_at desc
  `;
  return rows.map(mapCard);
}

export async function listOwnerProperties(userId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  return sql<{
    id: string;
    title: string;
    slug: string;
    status: string;
    property_type: string;
    city: string;
    nightly_cents: number;
    rejection_reason: string | null;
  }>`
    select id, title, slug, status, property_type, city, nightly_cents, rejection_reason
    from properties
    where owner_user_id = ${profile.userId}
    order by updated_at desc
  `;
}

export async function listOwnerBookings(userId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  return sql<{
    id: string;
    status: string;
    check_in: string;
    check_out: string;
    total_cents: number;
    title: string;
  }>`
    select b.id, b.status, b.check_in::text as check_in, b.check_out::text as check_out,
           b.total_cents, p.title
    from bookings b
    join properties p on p.id = b.property_id
    where p.owner_user_id = ${profile.userId}
    order by b.check_in desc
  `;
}

export async function listPendingListings(userId: string) {
  await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  return sql<{
    id: string;
    title: string;
    slug: string;
    property_type: string;
    city: string;
    owner_name: string;
  }>`
    select p.id, p.title, p.slug, p.property_type, p.city,
           pr.display_name as owner_name
    from properties p
    join profiles pr on pr.user_id = p.owner_user_id
    where p.status = 'PENDING_REVIEW'
    order by p.updated_at asc
  `;
}

export async function bookingsCsv(userId: string): Promise<string> {
  await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    status: string;
    check_in: string;
    check_out: string;
    total_cents: number;
    currency: string;
    title: string;
    guest_name: string;
  }>`
    select b.id, b.status, b.check_in::text as check_in, b.check_out::text as check_out,
           b.total_cents, b.currency, p.title, pr.display_name as guest_name
    from bookings b
    join properties p on p.id = b.property_id
    join profiles pr on pr.user_id = b.customer_user_id
    order by b.created_at desc
  `;
  const header = ["booking_id", "status", "check_in", "check_out", "total_cents", "currency", "property", "guest"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [row.id, row.status, row.check_in, row.check_out, String(row.total_cents), row.currency, row.title, row.guest_name]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function readPayoutAccount(userId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{
    account_name: string;
    bank_name: string;
    account_number: string;
    routing_code: string;
  }>`
    select account_name, bank_name, account_number, routing_code
    from payout_accounts where user_id = ${profile.userId}
  `;
  const payouts = await sql<{
    id: string;
    amount_cents: number;
    status: string;
    bank_reference: string | null;
    paid_at: string | null;
  }>`
    select id, amount_cents, status, bank_reference, paid_at::text as paid_at
    from payouts where user_id = ${profile.userId}
    order by created_at desc
  `;
  return { account: rows[0] ?? null, payouts };
}

export async function getStayBySlug(slug: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    description: string;
    property_type: string;
    city: string;
    region: string;
    country: string;
    nightly_cents: number;
    max_guests: number;
    bedrooms: number;
    beds: number;
    bathrooms: number;
    pets_allowed: boolean;
    amenities: unknown;
    house_rules: string;
    check_in_time: string;
    check_out_time: string;
    cancellation_policy: string;
  }>`
    select id, slug, title, summary, description, property_type, city, region, country,
           nightly_cents, max_guests, bedrooms, beds, bathrooms, pets_allowed, amenities,
           house_rules, check_in_time, check_out_time, cancellation_policy
    from properties
    where slug = ${slug} and status = 'LIVE'
  `;
  const row = rows[0];
  if (!row) return null;
  const amenities = Array.isArray(row.amenities) ? row.amenities.map(String) : [];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    propertyType: row.property_type,
    city: row.city,
    region: row.region,
    country: row.country,
    nightlyCents: row.nightly_cents,
    maxGuests: row.max_guests,
    bedrooms: row.bedrooms,
    beds: row.beds,
    bathrooms: Number(row.bathrooms),
    petsAllowed: row.pets_allowed,
    amenities,
    houseRules: row.house_rules,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    cancellationPolicy: row.cancellation_policy,
  };
}

export async function adminTables(userId: string) {
  await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  const bookings = await sql<{
    id: string;
    status: string;
    check_in: string;
    check_out: string;
    total_cents: number;
  }>`
    select id, status, check_in::text as check_in, check_out::text as check_out, total_cents
    from bookings order by created_at desc limit 50
  `;
  const payments = await sql<{ id: string; status: string; amount_cents: number; currency: string }>`
    select id, status, amount_cents, currency from payments order by created_at desc limit 50
  `;
  const payouts = await sql<{ id: string; status: string; amount_cents: number; bank_reference: string | null }>`
    select id, status, amount_cents, bank_reference from payouts order by created_at desc limit 50
  `;
  return { bookings, payments, payouts };
}


