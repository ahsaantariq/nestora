import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { stayNights } from "@/lib/domain/dates.ts";
import { quoteStay } from "../commerce.server.ts";
import { stripeConfigured, stripeForm } from "../stripe.server.ts";
import { readSecrets } from "./settings.server.ts";
import { addMessage } from "./inbox.server.ts";

const HOLD_MS = 30 * 60 * 1000;

export async function ensureGuestAccount(input: { email: string; name: string; phone: string }) {
  const email = input.email.trim().toLowerCase();
  const sql = await getSql();
  const existing = await sql<{ id: string; emailVerified: boolean }>`
    select id, "emailVerified" as "emailVerified" from "user" where lower(email) = ${email}
  `;
  if (existing[0]) {
    await sql`
      update profiles set
        phone = coalesce(phone, ${input.phone || null}),
        display_name = case when display_name in ('', 'Guest') then ${input.name.slice(0, 80)} else display_name end
      where user_id = ${existing[0].id}
    `;
    return { userId: existing[0].id, created: false, emailVerified: existing[0].emailVerified };
  }
  const userId = randomUUID();
  const now = new Date().toISOString();
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${input.name.slice(0, 80)}, ${email}, false, ${now}, ${now})
  `;
  await sql`
    insert into profiles (user_id, display_name, role, phone)
    values (${userId}, ${input.name.slice(0, 80)}, 'CUSTOMER', ${input.phone || null})
  `;
  await sql`
    insert into account (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
    values (${randomUUID()}, ${userId}, 'credential', ${userId}, ${now}, ${now})
  `;
  return { userId, created: true, emailVerified: false };
}

export async function createAssistantHold(input: {
  slug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  petCount: number;
  name: string;
  phone: string;
  email: string;
  conversationId: string;
  channel: string;
  discountBps: number;
}) {
  const quote = await quoteStay({
    slug: input.slug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    petCount: input.petCount,
  });
  const guest = await ensureGuestAccount({ email: input.email, name: input.name, phone: input.phone });
  const discount = input.discountBps > 0 ? Math.round(quote.totalCents * (input.discountBps / 10000)) : 0;
  const total = Math.max(0, quote.totalCents - discount);
  const sql = await getSql();
  const id = randomUUID();
  const holdExpires = new Date(Date.now() + HOLD_MS);
  const nights = stayNights(input.checkIn, input.checkOut);
  try {
    await sql.transaction(async (tx) => {
    await tx`delete from bookings where status = 'PENDING' and hold_expires_at is not null and hold_expires_at < now()`;
    await tx`
      insert into bookings (
        id, property_id, customer_user_id, status, check_in, check_out, adults, children, infants,
        pets, pet_count, currency, nightly_subtotal_cents, discount_cents, extra_guest_cents, pet_fee_cents,
        cleaning_fee_cents, tax_cents, service_fee_cents, total_cents, security_deposit_cents, fee_snapshot,
        instant_book, hold_expires_at, cancellation_policy, conversation_id, guest_name, guest_phone, payment_channel
      ) values (
        ${id}, ${quote.propertyId}, ${guest.userId}, 'PENDING', ${input.checkIn}, ${input.checkOut},
        ${input.adults}, ${input.children}, ${input.infants}, ${input.petCount > 0}, ${input.petCount},
        ${quote.currency}, ${quote.nightlySubtotalCents}, ${discount}, ${quote.extraGuestCents}, ${quote.petFeeCents},
        ${quote.cleaningFeeCents}, ${quote.taxCents}, ${quote.serviceFeeCents}, ${total}, ${quote.securityDepositCents},
        ${JSON.stringify({ lines: quote.lines })}::jsonb, ${quote.instantBook}, ${holdExpires.toISOString()},
        ${quote.cancellationPolicy}, ${input.conversationId}, ${input.name.slice(0, 80)}, ${input.phone.slice(0, 30)}, ${input.channel}
      )
    `;
    for (const night of nights) {
      await tx`
        insert into booking_nights (property_id, room_id, night, booking_id)
        values (${quote.propertyId}, '', ${night}, ${id})
      `;
    }
  });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
    if (code === "23505") throw new Error("Those dates were just taken.");
    throw error;
  }
  await sql`update contacts set user_id = ${guest.userId}, email = ${input.email.trim().toLowerCase()}, name = ${input.name.slice(0, 120)}, phone = ${input.phone} where id = (
    select contact_id from conversations where id = ${input.conversationId}
  )`;
  const { enqueueJob } = await import("./queue.server.ts");
  await enqueueJob("release_hold", { bookingId: id }, holdExpires, `release:${id}`);
  await enqueueJob("payment_reminder", { bookingId: id }, new Date(holdExpires.getTime() - 10 * 60 * 1000), `remind:${id}`);
  return {
    bookingId: id,
    title: quote.title,
    totalCents: total,
    currency: quote.currency,
    holdExpiresAt: holdExpires.toISOString(),
    lines: quote.lines,
    createdAccount: guest.created,
    alreadyVerified: guest.emailVerified,
  };
}

export async function createPaymentLink(bookingId: string) {
  if (!(await stripeConfigured())) throw new Error("Card payments are not set up yet.");
  const secrets = await readSecrets();
  if (!secrets.publicBaseUrl) throw new Error("Set the public site URL in Integrations before sending a payment link.");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    status: string;
    total_cents: number;
    currency: string;
    title: string;
    hold_expires_at: string | null;
    guest_email: string;
    conversation_id: string | null;
    payment_channel: string | null;
  }>`
    select b.id, b.status, b.total_cents, b.currency, p.title, b.hold_expires_at::text as hold_expires_at,
           u.email as guest_email, b.conversation_id, b.payment_channel
    from bookings b
    join properties p on p.id = b.property_id
    join "user" u on u.id = b.customer_user_id
    where b.id = ${bookingId}
  `;
  const booking = rows[0];
  if (!booking || booking.status !== "PENDING") throw new Error("That hold is no longer waiting for payment.");
  if (booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() < Date.now()) {
    throw new Error("The 30-minute hold expired.");
  }
  const expires = Math.floor(new Date(booking.hold_expires_at || Date.now() + HOLD_MS).getTime() / 1000);
  const session = await stripeForm(
    "checkout/sessions",
    {
      mode: "payment",
      customer_email: booking.guest_email,
      success_url: `${secrets.publicBaseUrl}/trips/${booking.id}`,
      cancel_url: `${secrets.publicBaseUrl}/search`,
      "metadata[booking_id]": booking.id,
      "payment_intent_data[metadata][booking_id]": booking.id,
      expires_at: Math.max(expires, Math.floor(Date.now() / 1000) + 30 * 60),
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": booking.currency || "usd",
      "line_items[0][price_data][unit_amount]": booking.total_cents,
      "line_items[0][price_data][product_data][name]": booking.title,
    },
    `checkout-${booking.id}-${Date.now()}`,
  );
  const url = String(session.url || "");
  await sql`
    update bookings set payment_url = ${url}, checkout_session_id = ${String(session.id || "")}, updated_at = now()
    where id = ${booking.id}
  `;
  if (booking.conversation_id) {
    await addMessage({
      conversationId: booking.conversation_id,
      channel: booking.payment_channel || "web",
      sender: "SYSTEM",
      kind: "PAYMENT",
      body: `Payment link created for ${booking.title}.`,
      meta: { bookingId: booking.id, url },
    });
  }
  return { url, bookingId: booking.id };
}

export async function releaseHold(bookingId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; conversation_id: string | null; title: string }>`
    update bookings set status = 'CANCELLED', updated_at = now()
    where id = ${bookingId} and status = 'PENDING'
    returning id, conversation_id, (select title from properties p where p.id = bookings.property_id) as title
  `;
  const row = rows[0];
  if (!row) return;
  await sql`delete from booking_nights where booking_id = ${bookingId}`;
  if (row.conversation_id) {
    await addMessage({
      conversationId: row.conversation_id,
      channel: "web",
      sender: "SYSTEM",
      kind: "BOOKING",
      body: `The hold for ${row.title} expired unpaid, so those dates are open again.`,
    });
  }
}

export async function setWelcomePassword(token: string, password: string) {
  if (password.length < 8) throw new Error("Use at least 8 characters.");
  const sql = await getSql();
  const rows = await sql<{ user_id: string; booking_id: string | null; expires_at: string; used_at: string | null }>`
    select user_id, booking_id, expires_at::text as expires_at, used_at::text as used_at
    from welcome_tokens where token = ${token}
  `;
  const row = rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) throw new Error("That link has expired. Ask Nestora for a new one.");
  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  await sql`
    update account set password = ${hash}, "updatedAt" = ${now}
    where "userId" = ${row.user_id} and "providerId" = 'credential'
  `;
  await sql`update "user" set "emailVerified" = true, "updatedAt" = ${now} where id = ${row.user_id}`;
  await sql`update welcome_tokens set used_at = now() where token = ${token}`;
  return { bookingId: row.booking_id };
}
