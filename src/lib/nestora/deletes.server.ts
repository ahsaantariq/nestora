import { verifyPassword } from "@better-auth/utils/password";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit.server.ts";
import { requireActive } from "./data.server.ts";

async function passwordMatches(userId: string, password: string) {
  const sql = await getSql();
  const rows = await sql<{ password: string | null }>`
    select password from account where "userId" = ${userId} and "providerId" = 'credential' limit 1
  `;
  const hash = rows[0]?.password;
  if (!hash) return false;
  return verifyPassword(hash, password);
}

async function bookingCount(propertyId: string) {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`select count(*)::int as n from bookings where property_id = ${propertyId}`;
  return rows[0]?.n ?? 0;
}

export async function deleteOwnProperty(userId: string, propertyId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ owner_user_id: string; status: string; title: string }>`
    select owner_user_id, status, title from properties where id = ${propertyId}
  `;
  const row = rows[0];
  if (!row) throw new Error("That property was not found.");
  if (row.owner_user_id !== profile.userId && profile.role !== "ADMIN") throw new Error("That listing is not yours.");
  const bookings = await bookingCount(propertyId);
  if (bookings > 0 && (row.status === "LIVE" || row.status === "PAUSED" || row.status === "PENDING_REVIEW")) {
    throw new Error("This property has bookings, so it can't be deleted. Pause it instead. Existing stays stay on the calendar.");
  }
  if (bookings > 0) throw new Error("This property has bookings, so it can't be deleted.");
  if (profile.role !== "ADMIN" && row.status !== "DRAFT" && row.status !== "REJECTED") {
    throw new Error("Only a draft can be deleted. Pause a live property if you want to stop new bookings.");
  }
  await sql`delete from properties where id = ${propertyId}`;
  return { ok: true as const };
}

export async function pauseOwnProperty(userId: string, propertyId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ owner_user_id: string; status: string }>`
    select owner_user_id, status from properties where id = ${propertyId}
  `;
  const row = rows[0];
  if (!row) throw new Error("That property was not found.");
  if (row.owner_user_id !== profile.userId && profile.role !== "ADMIN") throw new Error("That listing is not yours.");
  if (row.status !== "LIVE" && row.status !== "PAUSED") throw new Error("Only a live property can be paused.");
  await sql`update properties set status = 'PAUSED', updated_at = now() where id = ${propertyId}`;
  return { ok: true as const };
}

export async function deleteOwnRoom(userId: string, roomId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ id: string; property_id: string; owner_user_id: string; status: string }>`
    select r.id, r.property_id, p.owner_user_id, p.status
    from rooms r join properties p on p.id = r.property_id
    where r.id = ${roomId}
  `;
  const row = rows[0];
  if (!row) throw new Error("That room was not found.");
  if (row.owner_user_id !== profile.userId && profile.role !== "ADMIN") throw new Error("That room is not yours.");
  if (row.status !== "DRAFT" && row.status !== "REJECTED") {
    throw new Error("Rooms on a live property can't be deleted. Pause the property or edit the listing.");
  }
  await sql`delete from rooms where id = ${roomId}`;
  return { ok: true as const };
}

export async function listOwnerRooms(userId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  return sql<{
    id: string;
    name: string;
    property_id: string;
    property_title: string;
    status: string;
    nightly_cents: number;
  }>`
    select r.id, r.name, r.property_id, p.title as property_title, p.status, r.nightly_cents
    from rooms r join properties p on p.id = r.property_id
    where p.owner_user_id = ${profile.userId}
    order by p.title, r.name
  `;
}

export async function deleteSavedStay(userId: string, propertyId: string) {
  await requireActive(userId);
  const sql = await getSql();
  await sql`delete from saved_properties where user_id = ${userId} and property_id = ${propertyId}`;
  return { ok: true as const };
}

export async function deleteSavedCard(userId: string, cardId: string) {
  await requireActive(userId);
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from payment_methods where id = ${cardId} and user_id = ${userId} returning id
  `;
  if (!rows[0]) throw new Error("That card was not found.");
  return { ok: true as const };
}

export async function deleteOwnAccount(userId: string, password: string) {
  const profile = await requireActive(userId);
  if (profile.role === "ADMIN") throw new Error("An admin account can't be closed from here.");
  if (!(await passwordMatches(userId, password))) throw new Error("That password doesn't match.");
  const sql = await getSql();
  const bookings = await sql<{ n: number }>`
    select count(*)::int as n from bookings where customer_user_id = ${userId}
  `;
  const owned = await sql<{ n: number }>`
    select count(*)::int as n from bookings b
    join properties p on p.id = b.property_id
    where p.owner_user_id = ${userId}
  `;
  if ((bookings[0]?.n ?? 0) > 0 || (owned[0]?.n ?? 0) > 0) {
    await sql`
      update profiles
      set account_status = 'DEACTIVATED', deactivated_at = now(), updated_at = now()
      where user_id = ${userId}
    `;
    await sql`delete from session where "userId" = ${userId}`;
    return { ok: true as const, mode: "deactivated" as const };
  }
  await sql`delete from "user" where id = ${userId}`;
  return { ok: true as const, mode: "deleted" as const };
}

export async function adminDeleteProperty(actorId: string, propertyId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const bookings = await bookingCount(propertyId);
  if (bookings > 0) {
    throw new Error("This property has bookings. Pause it instead of deleting it, so payment history stays intact.");
  }
  const sql = await getSql();
  const rows = await sql<{ title: string }>`delete from properties where id = ${propertyId} returning title`;
  if (!rows[0]) throw new Error("That property was not found.");
  await writeAudit(actor.userId, "admin.delete-property", propertyId, { title: rows[0].title });
  return { ok: true as const };
}

export async function adminDeleteUser(actorId: string, userId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  if (actor.userId === userId) throw new Error("You can't delete your own admin account.");
  const sql = await getSql();
  const target = await sql<{ role: string; email: string }>`
    select p.role, u.email from profiles p join "user" u on u.id = p.user_id where p.user_id = ${userId}
  `;
  if (!target[0]) throw new Error("That account was not found.");
  if (target[0].role === "ADMIN") throw new Error("Admin accounts are not deleted from here.");
  const bookings = await sql<{ n: number }>`
    select (
      (select count(*) from bookings where customer_user_id = ${userId})
      + (select count(*) from bookings b join properties p on p.id = b.property_id where p.owner_user_id = ${userId})
    )::int as n
  `;
  if ((bookings[0]?.n ?? 0) > 0) {
    await sql`
      update profiles
      set account_status = 'DEACTIVATED', deactivated_at = now(), updated_at = now()
      where user_id = ${userId}
    `;
    await sql`delete from session where "userId" = ${userId}`;
    await writeAudit(actor.userId, "admin.deactivate-user", userId, { email: target[0].email });
    return { ok: true as const, mode: "deactivated" as const };
  }
  await sql`delete from "user" where id = ${userId}`;
  await writeAudit(actor.userId, "admin.delete-user", userId, { email: target[0].email });
  return { ok: true as const, mode: "deleted" as const };
}

export async function adminDeleteReview(actorId: string, reviewId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ id: string }>`delete from reviews where id = ${reviewId} returning id`;
  if (!rows[0]) throw new Error("That review was not found.");
  await writeAudit(actor.userId, "admin.delete-review", reviewId, {});
  return { ok: true as const };
}

export async function adminDeletePromo(actorId: string, code: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ code: string }>`delete from promo_codes where lower(code) = lower(${code}) returning code`;
  if (!rows[0]) throw new Error("That promo code was not found.");
  await writeAudit(actor.userId, "admin.delete-promo", rows[0].code, {});
  return { ok: true as const };
}

export async function listPromos(actorId: string) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  return sql<{ code: string; percent_bps: number | null; amount_cents: number | null; active: boolean; used_count: number }>`
    select code, percent_bps, amount_cents, active, used_count from promo_codes order by code
  `;
}

export async function savePromo(
  actorId: string,
  input: { code: string; percent: number | null; amountCents: number | null },
) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw new Error("Use 3–24 letters or numbers.");
  if ((input.percent == null) === (input.amountCents == null)) {
    throw new Error("Set either a percent off or a fixed amount, not both.");
  }
  const sql = await getSql();
  await sql`
    insert into promo_codes (code, percent_bps, amount_cents, active)
    values (${code}, ${input.percent}, ${input.amountCents}, true)
    on conflict (code) do update set percent_bps = excluded.percent_bps, amount_cents = excluded.amount_cents, active = true
  `;
  await writeAudit(actor.userId, "admin.save-promo", code, {});
  return listPromos(actorId);
}

export async function listReviews(actorId: string) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  return sql<{ id: string; rating: number; body: string; title: string; author: string }>`
    select r.id, r.rating, r.body, p.title, u.email as author
    from reviews r
    join properties p on p.id = r.property_id
    join "user" u on u.id = r.author_user_id
    order by r.created_at desc
    limit 100
  `;
}

export async function listAllProperties(actorId: string) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  return sql<{ id: string; title: string; status: string; city: string; owner: string }>`
    select p.id, p.title, p.status, p.city, u.email as owner
    from properties p join "user" u on u.id = p.owner_user_id
    order by p.updated_at desc
    limit 200
  `;
}

export async function setOwnerPropertyCap(actorId: string, userId: string, maxProperties: number | null) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  if (maxProperties != null && (!Number.isInteger(maxProperties) || maxProperties < 1 || maxProperties > 10000)) {
    throw new Error("Use a limit of at least 1, or leave it empty for no limit.");
  }
  const sql = await getSql();
  await sql`update profiles set max_properties = ${maxProperties}, updated_at = now() where user_id = ${userId}`;
  await writeAudit(actor.userId, "admin.property-cap", userId, { maxProperties });
  return { ok: true as const };
}
