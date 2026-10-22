import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { stayBlocksCalendar, type BlockingStay } from "@/lib/domain/availability.ts";
import { stayNights } from "@/lib/domain/dates.ts";
import { applyBps } from "@/lib/domain/money.ts";
import { calculateStayPrice } from "@/lib/domain/pricing.ts";
import { calculateRefund, DEFAULT_REFUND_RULES, type PolicyCode } from "@/lib/domain/refund.ts";
import { requireActive, readSettings, type SettingsView } from "./data.server.ts";
import { notifyUser } from "./mail.server.ts";
import { stripeConfigured, stripeForm, stripeGet, stripePublishableKey } from "./stripe.server.ts";

const HOLD_MS = 15 * 60 * 1000;

function uniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505";
}

async function audit(actorId: string, action: string, target: string, detail: Record<string, unknown>) {
  const sql = await getSql();
  await sql`
    insert into audit_log (id, actor_user_id, action, target, detail)
    values (${randomUUID()}, ${actorId}, ${action}, ${target}, ${JSON.stringify(detail)}::jsonb)
  `;
}

type PropertyQuoteRow = {
  id: string;
  owner_user_id: string;
  title: string;
  slug: string;
  status: string;
  nightly_cents: number;
  weekend_cents: number | null;
  weekly_discount_bps: number;
  monthly_discount_bps: number;
  extra_guest_fee_cents: number;
  included_guests: number;
  pet_fee_cents: number;
  pets_allowed: boolean;
  max_pets: number;
  cleaning_fee_cents: number;
  security_deposit_cents: number;
  min_nights: number;
  max_nights: number | null;
  max_guests: number;
  instant_book: boolean;
  cancellation_policy: string;
  currency: string;
};

export async function quoteStay(input: {
  slug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  petCount: number;
  promoCode?: string;
}) {
  const sql = await getSql();
  const rows = await sql<PropertyQuoteRow>`
    select p.id, p.owner_user_id, p.title, p.slug, p.status, p.nightly_cents, p.weekend_cents,
           p.weekly_discount_bps, p.monthly_discount_bps, p.extra_guest_fee_cents, p.included_guests,
           p.pet_fee_cents, p.pets_allowed, p.max_pets, p.cleaning_fee_cents, p.security_deposit_cents,
           p.min_nights, p.max_nights, p.max_guests, p.instant_book, p.cancellation_policy,
           s.currency
    from properties p
    cross join platform_settings s
    where p.slug = ${input.slug} and p.status = 'LIVE' and s.id = 1
  `;
  const property = rows[0];
  if (!property) throw new Error("That stay is not available to book.");
  const nights = stayNights(input.checkIn, input.checkOut);
  if (nights.length < property.min_nights) throw new Error(`This stay asks for at least ${property.min_nights} nights.`);
  if (property.max_nights != null && nights.length > property.max_nights) {
    throw new Error(`This stay allows at most ${property.max_nights} nights.`);
  }
  if (input.adults + input.children > property.max_guests) throw new Error("That is more guests than the stay allows.");
  if (input.petCount > 0 && !property.pets_allowed) throw new Error("Pets are not allowed at this stay.");
  if (input.petCount > property.max_pets) throw new Error("That is more pets than the stay allows.");

  const seasons = await sql<{ starts_on: string; ends_on: string; nightly_cents: number }>`
    select starts_on::text as starts_on, ends_on::text as ends_on, nightly_cents
    from seasonal_rates where property_id = ${property.id}
  `;
  const custom = await sql<{ day: string; price_cents: number | null; blocked: boolean }>`
    select day::text as day, price_cents, blocked from calendar_days
    where property_id = ${property.id} and room_id = ''
      and day >= ${input.checkIn}::date and day < ${input.checkOut}::date
  `;
  const blocked = new Set(custom.filter((day) => day.blocked).map((day) => day.day));
  if (nights.some((night) => blocked.has(night))) throw new Error("One of those nights is blocked by the host.");

  const existing = await sql<BlockingStay & { check_in: string; check_out: string; hold_expires_at: string | null; status: BlockingStay["status"] }>`
    select id, status, check_in::text as "checkIn", check_out::text as "checkOut", hold_expires_at::text as "holdExpiresAt"
    from bookings
    where property_id = ${property.id} and status in ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
  `;
  const now = new Date();
  for (const stay of existing) {
    const blocks = stayBlocksCalendar(
      {
        id: stay.id,
        status: stay.status,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        holdExpiresAt: stay.holdExpiresAt,
      },
      now,
    );
    if (!blocks) continue;
    const overlap = nights.some((night) => night >= stay.checkIn && night < stay.checkOut);
    if (overlap) throw new Error("Those dates are already held or booked.");
  }

  const customNightCents: Record<string, number> = {};
  for (const night of nights) {
    const day = custom.find((item) => item.day === night && item.price_cents != null);
    if (day?.price_cents != null) {
      customNightCents[night] = day.price_cents;
      continue;
    }
    const season = seasons.find((item) => night >= item.starts_on && night <= item.ends_on);
    if (season) customNightCents[night] = season.nightly_cents;
  }
  const settings = await readSettings();
  const price = calculateStayPrice({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nightlyCents: property.nightly_cents,
    weekendCents: property.weekend_cents,
    weeklyDiscountBps: property.weekly_discount_bps,
    monthlyDiscountBps: property.monthly_discount_bps,
    extraGuestFeeCents: property.extra_guest_fee_cents,
    includedGuests: property.included_guests,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    petFeeCents: property.pet_fee_cents,
    petCount: input.petCount,
    cleaningFeeCents: property.cleaning_fee_cents,
    securityDepositCents: property.security_deposit_cents,
    taxBps: settings.taxBps,
    serviceFeeBps: settings.serviceFeeBps,
    customNightCents,
  });
  const promo = await promoDiscount(sql, input.promoCode, price.totalCents);
  return {
    propertyId: property.id,
    title: property.title,
    slug: property.slug,
    instantBook: property.instant_book,
    currency: property.currency || settings.currency,
    cancellationPolicy: property.cancellation_policy,
    ...price,
    promoCode: promo.code,
    promoCents: promo.cents,
    totalCents: price.totalCents - promo.cents,
    lines: promo.cents > 0 ? [...price.lines, { label: `Code ${promo.code}`, cents: -promo.cents, kind: "discount" as const }] : price.lines,
  };
}

async function promoDiscount(sql: Sql, code: string | undefined, totalCents: number) {
  const trimmed = code?.trim();
  if (!trimmed) return { code: null as string | null, cents: 0 };
  const rows = await sql<{
    code: string;
    percent_bps: number | null;
    amount_cents: number | null;
    active: boolean;
    max_uses: number | null;
    used_count: number;
    expires_on: string | null;
  }>`
    select code, percent_bps, amount_cents, active, max_uses, used_count, expires_on::text as expires_on
    from promo_codes where lower(code) = lower(${trimmed})
  `;
  const promo = rows[0];
  if (!promo || !promo.active) throw new Error("That code is not active.");
  if (promo.expires_on && promo.expires_on < new Date().toISOString().slice(0, 10)) throw new Error("That code has expired.");
  if (promo.max_uses != null && promo.used_count >= promo.max_uses) throw new Error("That code has been used up.");
  const cents = promo.percent_bps != null
    ? Math.min(totalCents, applyBps(totalCents, promo.percent_bps))
    : Math.min(totalCents, promo.amount_cents ?? 0);
  return { code: promo.code, cents };
}

export async function createHold(userId: string, input: {
  slug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  petCount: number;
  promoCode?: string;
  requests: string;
}) {
  const profile = await requireActive(userId);
  const quote = await quoteStay(input);
  if (quote.propertyId && profile.userId) {
    const sql = await getSql();
    const owner = await sql<{ owner_user_id: string }>`select owner_user_id from properties where id = ${quote.propertyId}`;
    if (owner[0]?.owner_user_id === profile.userId) throw new Error("You can't book your own listing.");
  }
  const nights = stayNights(input.checkIn, input.checkOut);
  const sql = await getSql();
  const id = randomUUID();
  const holdExpires = new Date(Date.now() + HOLD_MS).toISOString();
  try {
    await sql.transaction(async (tx) => {
      await tx`
        delete from bookings
        where status = 'PENDING' and hold_expires_at is not null and hold_expires_at < now()
      `;
      await tx`
        insert into bookings (
          id, property_id, customer_user_id, status, check_in, check_out, adults, children, infants,
          pets, pet_count, special_requests, currency, nightly_subtotal_cents, discount_cents,
          extra_guest_cents, pet_fee_cents, cleaning_fee_cents, tax_cents, service_fee_cents,
          total_cents, security_deposit_cents, fee_snapshot, instant_book, hold_expires_at,
          cancellation_policy, promo_code, promo_cents
        ) values (
          ${id}, ${quote.propertyId}, ${profile.userId}, 'PENDING', ${input.checkIn}, ${input.checkOut},
          ${input.adults}, ${input.children}, ${input.infants}, ${input.petCount > 0}, ${input.petCount},
          ${input.requests.slice(0, 1000)}, ${quote.currency}, ${quote.nightlySubtotalCents}, ${quote.discountCents},
          ${quote.extraGuestCents}, ${quote.petFeeCents}, ${quote.cleaningFeeCents}, ${quote.taxCents},
          ${quote.serviceFeeCents}, ${quote.totalCents}, ${quote.securityDepositCents},
          ${JSON.stringify({ lines: quote.lines })}::jsonb, ${quote.instantBook}, ${holdExpires},
          ${quote.cancellationPolicy}, ${quote.promoCode}, ${quote.promoCents}
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
    if (uniqueViolation(error)) throw new Error("Those dates were just taken. Pick another set.");
    throw error;
  }
  return { bookingId: id, holdExpiresAt: holdExpires };
}

export async function readCheckout(userId: string, bookingId: string) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    status: string;
    check_in: string;
    check_out: string;
    total_cents: number;
    currency: string;
    hold_expires_at: string | null;
    promo_code: string | null;
    promo_cents: number;
    title: string;
    slug: string;
    instant_book: boolean;
    customer_user_id: string;
    stripe_payment_intent_id: string | null;
  }>`
    select b.id, b.status, b.check_in::text as check_in, b.check_out::text as check_out, b.total_cents,
           b.currency, b.hold_expires_at::text as hold_expires_at, b.promo_code, b.promo_cents,
           b.customer_user_id, b.stripe_payment_intent_id, b.instant_book, p.title, p.slug
    from bookings b join properties p on p.id = b.property_id
    where b.id = ${bookingId} and b.customer_user_id = ${profile.userId}
  `;
  const row = rows[0];
  if (!row) throw new Error("That checkout was not found.");
  return {
    ...row,
    paymentsReady: stripeConfigured() && Boolean(stripePublishableKey()),
    publishableKey: stripePublishableKey(),
  };
}

export async function beginCardPayment(userId: string, bookingId: string) {
  const checkout = await readCheckout(userId, bookingId);
  if (checkout.status !== "PENDING") throw new Error("This booking is no longer waiting for payment.");
  if (checkout.hold_expires_at && new Date(checkout.hold_expires_at).getTime() < Date.now()) {
    throw new Error("The 15-minute hold expired. Start the booking again.");
  }
  if (!stripeConfigured()) throw new Error("Card payments are not configured. Set STRIPE_SECRET_KEY on the server.");
  const sql = await getSql();
  const profile = await requireActive(userId);
  let customerId = (await sql<{ stripe_customer_id: string | null }>`
    select stripe_customer_id from profiles where user_id = ${profile.userId}
  `)[0]?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripeForm("customers", { email: profile.email, name: profile.displayName }, `customer-${profile.userId}`);
    customerId = String(customer.id);
    await sql`update profiles set stripe_customer_id = ${customerId} where user_id = ${profile.userId}`;
  }
  const intent = await stripeForm(
    "payment_intents",
    {
      amount: checkout.total_cents,
      currency: checkout.currency || "usd",
      customer: customerId,
      "metadata[booking_id]": checkout.id,
      "automatic_payment_methods[enabled]": true,
    },
    `pay-${checkout.id}`,
  );
  const intentId = String(intent.id);
  await sql`
    update bookings set stripe_payment_intent_id = ${intentId}, updated_at = now() where id = ${checkout.id}
  `;
  await sql`
    insert into payments (id, booking_id, user_id, stripe_payment_intent_id, idempotency_key, amount_cents, currency, status)
    values (${randomUUID()}, ${checkout.id}, ${profile.userId}, ${intentId}, ${`pay-${checkout.id}`}, ${checkout.total_cents}, ${checkout.currency}, 'REQUIRES_PAYMENT')
    on conflict (idempotency_key) do update set stripe_payment_intent_id = excluded.stripe_payment_intent_id, status = 'REQUIRES_PAYMENT'
  `;
  return { clientSecret: String(intent.client_secret), publishableKey: stripePublishableKey() };
}

export async function markBookingPaid(bookingId: string, paymentIntentId: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    status: string;
    customer_user_id: string;
    owner_user_id: string;
    title: string;
    check_in: string;
    check_out: string;
    total_cents: number;
    currency: string;
    promo_code: string | null;
    guest_email: string;
    owner_email: string;
    guest_mail: boolean;
    owner_mail: boolean;
  }>`
    select b.id, b.status, b.customer_user_id, p.owner_user_id, p.title,
           b.check_in::text as check_in, b.check_out::text as check_out, b.total_cents, b.currency, b.promo_code,
           gu.email as guest_email, ou.email as owner_email,
           gp.email_bookings as guest_mail, op.email_bookings as owner_mail
    from bookings b
    join properties p on p.id = b.property_id
    join "user" gu on gu.id = b.customer_user_id
    join "user" ou on ou.id = p.owner_user_id
    join profiles gp on gp.user_id = b.customer_user_id
    join profiles op on op.user_id = p.owner_user_id
    where b.id = ${bookingId}
  `;
  const booking = rows[0];
  if (!booking || booking.status === "CONFIRMED" || booking.status === "CHECKED_IN" || booking.status === "COMPLETED") {
    return;
  }
  const changed = await sql<{ id: string }>`
    update bookings set status = 'CONFIRMED', hold_expires_at = null, updated_at = now()
    where id = ${bookingId} and status = 'PENDING'
    returning id
  `;
  if (changed.length === 0) return;
  await sql`
    update payments set status = 'SUCCEEDED' where stripe_payment_intent_id = ${paymentIntentId}
  `;
  if (booking.promo_code) {
    await sql`update promo_codes set used_count = used_count + 1 where code = ${booking.promo_code}`;
  }
  const text = `${booking.title}: ${booking.check_in} to ${booking.check_out}. Total ${(booking.total_cents / 100).toFixed(2)} ${booking.currency.toUpperCase()}.`;
  await notifyUser({
    userId: booking.customer_user_id,
    email: booking.guest_email,
    emailOn: booking.guest_mail,
    template: "booking-confirmed",
    title: `Booking confirmed — ${booking.title}`,
    body: text,
    href: `/trips/${booking.id}`,
  });
  await notifyUser({
    userId: booking.owner_user_id,
    email: booking.owner_email,
    emailOn: booking.owner_mail,
    template: "owner-new-booking",
    title: `New booking — ${booking.title}`,
    body: text,
    href: "/host/bookings",
  });
}

export async function syncPayment(userId: string, bookingId: string) {
  const checkout = await readCheckout(userId, bookingId);
  if (!checkout.stripe_payment_intent_id || !stripeConfigured()) return checkout;
  const intent = await stripeGet(`payment_intents/${checkout.stripe_payment_intent_id}`);
  if (intent.status === "succeeded") await markBookingPaid(bookingId, checkout.stripe_payment_intent_id);
  return readCheckout(userId, bookingId);
}

export async function ingestStripeEvent(eventId: string, type: string, payload: unknown) {
  const sql = await getSql();
  const inserted = await sql<{ id: string }>`
    insert into stripe_events (id, type, payload)
    values (${eventId}, ${type}, ${JSON.stringify(payload)}::jsonb)
    on conflict (id) do nothing
    returning id
  `;
  if (inserted.length === 0) return { duplicate: true as const };
  if (type === "payment_intent.succeeded") {
    const object = (payload as { data?: { object?: { id?: string; metadata?: { booking_id?: string } } } }).data?.object;
    const bookingId = object?.metadata?.booking_id;
    if (bookingId && object?.id) await markBookingPaid(bookingId, object.id);
  }
  if (type === "charge.refunded" || type === "refund.failed" || type === "refund.updated") {
    const object = (payload as { data?: { object?: { id?: string; status?: string; payment_intent?: string; failure_reason?: string } } }).data?.object;
    if (object?.id) {
      await sql`
        update refunds
        set status = ${object.status === "succeeded" ? "SUCCEEDED" : object.status === "failed" ? "FAILED" : "PENDING"},
            failure_message = ${object.failure_reason ?? null},
            updated_at = now()
        where stripe_refund_id = ${object.id}
      `;
      if (object.status === "succeeded") {
        await sql`
          update bookings set status = 'REFUNDED', updated_at = now()
          where id in (select booking_id from refunds where stripe_refund_id = ${object.id})
        `;
      }
    }
  }
  return { duplicate: false as const };
}

async function policyRules(code: string, settings: SettingsView) {
  const match = settings.policies.find((policy) => policy.code === code);
  if (match) return match.rules;
  const fallback = DEFAULT_REFUND_RULES[(code as PolicyCode) in DEFAULT_REFUND_RULES ? (code as PolicyCode) : "MODERATE"];
  return fallback;
}

export async function previewCancellation(userId: string, bookingId: string) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    customer_user_id: string;
    owner_user_id: string;
    status: string;
    check_in: string;
    total_cents: number;
    cancellation_policy: string;
  }>`
    select b.id, b.customer_user_id, p.owner_user_id, b.status, b.check_in::text as check_in,
           b.total_cents, b.cancellation_policy
    from bookings b join properties p on p.id = b.property_id
    where b.id = ${bookingId}
  `;
  const booking = rows[0];
  if (!booking) throw new Error("Booking not found.");
  const isGuest = booking.customer_user_id === profile.userId;
  const isOwner = booking.owner_user_id === profile.userId;
  if (!isGuest && !isOwner && profile.role !== "ADMIN") throw new Error("You don't have access to that booking.");
  const settings = await readSettings();
  const rules = await policyRules(booking.cancellation_policy, settings);
  const checkInAt = new Date(`${booking.check_in}T15:00:00Z`);
  const refund = calculateRefund({
    rules,
    checkInAt,
    cancelledAt: new Date(),
    amountPaidCents: booking.total_cents,
    fullRefundOverride: profile.role === "ADMIN",
  });
  return { ...refund, status: booking.status, policy: booking.cancellation_policy, isAdmin: profile.role === "ADMIN" };
}

export async function cancelBooking(userId: string, bookingId: string) {
  const preview = await previewCancellation(userId, bookingId);
  if (preview.status === "CANCELLED" || preview.status === "REFUNDED") return preview;
  if (preview.status !== "CONFIRMED" && preview.status !== "PENDING" && preview.status !== "CHECKED_IN") {
    throw new Error("This booking can't be cancelled from its current status.");
  }
  const profile = await requireActive(userId);
  const sql = await getSql();
  await sql`
    update bookings set status = 'CANCELLED', updated_at = now() where id = ${bookingId}
  `;
  await sql`delete from booking_nights where booking_id = ${bookingId}`;
  const payments = await sql<{ id: string; stripe_payment_intent_id: string | null; amount_cents: number }>`
    select id, stripe_payment_intent_id, amount_cents from payments
    where booking_id = ${bookingId} and status = 'SUCCEEDED'
    order by created_at desc limit 1
  `;
  const payment = payments[0];
  let refundStatus = "NONE";
  if (payment && preview.refundCents > 0) {
    refundStatus = await issueRefund({
      actorId: profile.userId,
      bookingId,
      paymentId: payment.id,
      paymentIntentId: payment.stripe_payment_intent_id,
      amountCents: preview.refundCents,
      reason: profile.role === "ADMIN" ? "admin" : "requested_by_customer",
    });
  }
  const people = await sql<{ user_id: string; email: string; email_bookings: boolean; title: string }>`
    select u.id as user_id, u.email, pr.email_bookings, p.title
    from bookings b
    join properties p on p.id = b.property_id
    join "user" u on u.id in (b.customer_user_id, p.owner_user_id)
    join profiles pr on pr.user_id = u.id
    where b.id = ${bookingId}
  `;
  for (const person of people) {
    await notifyUser({
      userId: person.user_id,
      email: person.email,
      emailOn: person.email_bookings,
      template: "booking-cancelled",
      title: `Booking cancelled — ${person.title}`,
      body: preview.refundCents > 0
        ? `Refund of ${(preview.refundCents / 100).toFixed(2)} is ${refundStatus.toLowerCase()}.`
        : "No refund is due under the cancellation policy.",
      href: `/trips/${bookingId}`,
    });
  }
  await audit(profile.userId, "booking.cancel", bookingId, { refundCents: preview.refundCents, refundStatus });
  return { ...preview, refundStatus };
}

async function issueRefund(input: {
  actorId: string;
  bookingId: string;
  paymentId: string;
  paymentIntentId: string | null;
  amountCents: number;
  reason: string;
}) {
  const sql = await getSql();
  const refundId = randomUUID();
  const idempotency = `refund-${input.bookingId}-${input.amountCents}`;
  if (!input.paymentIntentId || !stripeConfigured()) {
    await sql`
      insert into refunds (id, payment_id, booking_id, idempotency_key, amount_cents, status, reason, failure_message)
      values (${refundId}, ${input.paymentId}, ${input.bookingId}, ${idempotency}, ${input.amountCents}, 'FAILED', ${input.reason}, 'Stripe is not configured or this booking has no payment intent.')
      on conflict (idempotency_key) do update set status = 'FAILED', failure_message = excluded.failure_message, updated_at = now()
    `;
    const admins = await sql<{ user_id: string; email: string }>`
      select p.user_id, u.email from profiles p join "user" u on u.id = p.user_id where p.role = 'ADMIN'
    `;
    for (const admin of admins) {
      await notifyUser({
        userId: admin.user_id,
        email: admin.email,
        emailOn: true,
        template: "refund-failed",
        title: "Refund needs attention",
        body: `Booking ${input.bookingId} could not be refunded automatically.`,
        href: "/admin/bookings",
      });
    }
    return "FAILED";
  }
  try {
    const refund = await stripeForm(
      "refunds",
      { payment_intent: input.paymentIntentId, amount: input.amountCents },
      idempotency,
    );
    const status = refund.status === "succeeded" ? "SUCCEEDED" : refund.status === "failed" ? "FAILED" : "PENDING";
    await sql`
      insert into refunds (id, payment_id, booking_id, stripe_refund_id, idempotency_key, amount_cents, status, reason)
      values (${refundId}, ${input.paymentId}, ${input.bookingId}, ${String(refund.id)}, ${idempotency}, ${input.amountCents}, ${status}, ${input.reason})
      on conflict (idempotency_key) do update
        set status = excluded.status, stripe_refund_id = excluded.stripe_refund_id, failure_message = null, updated_at = now()
    `;
    if (status === "SUCCEEDED") {
      await sql`update bookings set status = 'REFUNDED', updated_at = now() where id = ${input.bookingId}`;
    }
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund failed";
    await sql`
      insert into refunds (id, payment_id, booking_id, idempotency_key, amount_cents, status, reason, failure_message)
      values (${refundId}, ${input.paymentId}, ${input.bookingId}, ${idempotency}, ${input.amountCents}, 'FAILED', ${input.reason}, ${message})
      on conflict (idempotency_key) do update set status = 'FAILED', failure_message = excluded.failure_message, updated_at = now()
    `;
    return "FAILED";
  }
}

export async function retryRefund(userId: string, bookingId: string) {
  const profile = await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  const payments = await sql<{ id: string; stripe_payment_intent_id: string | null; amount_cents: number }>`
    select id, stripe_payment_intent_id, amount_cents from payments
    where booking_id = ${bookingId} and status = 'SUCCEEDED'
    order by created_at desc limit 1
  `;
  const payment = payments[0];
  if (!payment) throw new Error("There is no succeeded payment to refund.");
  await sql`delete from refunds where booking_id = ${bookingId} and status = 'FAILED'`;
  const status = await issueRefund({
    actorId: profile.userId,
    bookingId,
    paymentId: payment.id,
    paymentIntentId: payment.stripe_payment_intent_id,
    amountCents: payment.amount_cents,
    reason: "admin_retry",
  });
  await audit(profile.userId, "refund.retry", bookingId, { status });
  return { refundStatus: status };
}

export async function toggleSaved(userId: string, propertyId: string) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  const existing = await sql`select 1 from saved_properties where user_id = ${profile.userId} and property_id = ${propertyId}`;
  if (existing.length > 0) {
    await sql`delete from saved_properties where user_id = ${profile.userId} and property_id = ${propertyId}`;
    return { saved: false };
  }
  await sql`
    insert into saved_properties (user_id, property_id) values (${profile.userId}, ${propertyId})
    on conflict (user_id, property_id) do nothing
  `;
  return { saved: true };
}

export async function listNotifications(userId: string) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  return sql<{ id: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string }>`
    select id, title, body, href, read_at::text as read_at, created_at::text as created_at
    from notifications where user_id = ${profile.userId}
    order by created_at desc limit 50
  `;
}

export async function markNotificationsRead(userId: string) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  await sql`update notifications set read_at = now() where user_id = ${profile.userId} and read_at is null`;
  return { ok: true as const };
}

export async function saveSearch(userId: string, label: string, query: unknown) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  await sql`
    insert into saved_searches (id, user_id, label, query)
    values (${randomUUID()}, ${profile.userId}, ${label.slice(0, 80)}, ${JSON.stringify(query)}::jsonb)
  `;
  return { ok: true as const };
}

export async function writeReview(userId: string, input: { bookingId: string; rating: number; body: string }) {
  const profile = await requireActive(userId);
  if (input.rating < 1 || input.rating > 5) throw new Error("Rate the stay from 1 to 5.");
  const sql = await getSql();
  const rows = await sql<{ id: string; property_id: string; status: string; customer_user_id: string }>`
    select id, property_id, status, customer_user_id from bookings where id = ${input.bookingId}
  `;
  const booking = rows[0];
  if (!booking || booking.customer_user_id !== profile.userId) throw new Error("That stay is not yours.");
  if (booking.status !== "COMPLETED") throw new Error("You can review a stay only after it is completed.");
  await sql`
    insert into reviews (id, property_id, booking_id, author_user_id, rating, body)
    values (${randomUUID()}, ${booking.property_id}, ${booking.id}, ${profile.userId}, ${input.rating}, ${input.body.trim().slice(0, 2000)})
  `;
  return { ok: true as const };
}

export async function replyToReview(userId: string, reviewId: string, body: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ owner_user_id: string }>`
    select p.owner_user_id from reviews r join properties p on p.id = r.property_id where r.id = ${reviewId}
  `;
  if (!rows[0] || (rows[0].owner_user_id !== profile.userId && profile.role !== "ADMIN")) {
    throw new Error("That review is not on your listing.");
  }
  await sql`update reviews set owner_reply = ${body.trim().slice(0, 2000)} where id = ${reviewId}`;
  return { ok: true as const };
}

export async function moderateReview(userId: string, reviewId: string, hidden: boolean) {
  const profile = await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  await sql`update reviews set hidden = ${hidden} where id = ${reviewId}`;
  await audit(profile.userId, hidden ? "review.hide" : "review.show", reviewId, {});
  return { ok: true as const };
}

export async function ownerSeries(userId: string) {
  const profile = await requireActive(userId, ["OWNER", "ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ month: string; revenue_cents: number; bookings: number }>`
    select to_char(date_trunc('month', b.created_at), 'YYYY-MM') as month,
           coalesce(sum(b.total_cents), 0)::int as revenue_cents,
           count(*)::int as bookings
    from bookings b
    join properties p on p.id = b.property_id
    where p.owner_user_id = ${profile.userId}
      and b.status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')
      and b.created_at >= date_trunc('month', now()) - interval '5 months'
    group by 1
    order by 1
  `;
  return rows;
}

export async function savePlatformSettings(userId: string, input: {
  subscriptionEnabled: boolean;
  subscriptionAmountCents: number;
  commissionEnabled: boolean;
  commissionBps: number;
  managedManagementBps: number;
  taxBps: number;
  serviceFeeBps: number;
}) {
  const profile = await requireActive(userId, ["ADMIN"]);
  for (const value of [input.commissionBps, input.managedManagementBps, input.taxBps, input.serviceFeeBps]) {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new Error("Percentages must be between 0 and 100.");
  }
  if (!Number.isInteger(input.subscriptionAmountCents) || input.subscriptionAmountCents < 0) {
    throw new Error("Subscription amount must be zero or more.");
  }
  const sql = await getSql();
  await sql`
    update platform_settings set
      subscription_enabled = ${input.subscriptionEnabled},
      subscription_amount_cents = ${input.subscriptionAmountCents},
      commission_enabled = ${input.commissionEnabled},
      commission_type = 'PERCENT',
      commission_bps = ${input.commissionBps},
      managed_management_bps = ${input.managedManagementBps},
      tax_bps = ${input.taxBps},
      service_fee_bps = ${input.serviceFeeBps},
      stripe_subscription_price_id = null,
      updated_at = now()
    where id = 1
  `;
  await audit(profile.userId, "settings.update", "platform", input);
  return readSettings();
}

export async function decideListing(userId: string, input: { propertyId: string; decision: "APPROVE" | "REJECT"; reason: string }) {
  const profile = await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ id: string; title: string; owner_user_id: string; email: string; email_bookings: boolean }>`
    select p.id, p.title, p.owner_user_id, u.email, pr.email_bookings
    from properties p
    join profiles pr on pr.user_id = p.owner_user_id
    join "user" u on u.id = p.owner_user_id
    where p.id = ${input.propertyId} and p.status = 'PENDING_REVIEW'
  `;
  const listing = rows[0];
  if (!listing) throw new Error("That listing is not waiting for review.");
  if (input.decision === "APPROVE") {
    await sql`update properties set status = 'LIVE', rejection_reason = null, updated_at = now() where id = ${listing.id}`;
  } else {
    if (!input.reason.trim()) throw new Error("Tell the host why it was rejected.");
    await sql`
      update properties set status = 'REJECTED', rejection_reason = ${input.reason.trim().slice(0, 500)}, updated_at = now()
      where id = ${listing.id}
    `;
  }
  await notifyUser({
    userId: listing.owner_user_id,
    email: listing.email,
    emailOn: listing.email_bookings,
    template: input.decision === "APPROVE" ? "listing-approved" : "listing-rejected",
    title: input.decision === "APPROVE" ? `Approved: ${listing.title}` : `Not approved: ${listing.title}`,
    body: input.decision === "APPROVE" ? "Your listing is live." : input.reason.trim(),
    href: "/host/properties",
  });
  await audit(profile.userId, `listing.${input.decision.toLowerCase()}`, listing.id, { reason: input.reason });
  return { ok: true as const };
}

export async function markPayoutPaid(userId: string, payoutId: string, bankReference: string) {
  const profile = await requireActive(userId, ["ADMIN"]);
  if (!bankReference.trim()) throw new Error("Add the bank reference.");
  const sql = await getSql();
  const rows = await sql<{ user_id: string; amount_cents: number }>`
    update payouts set status = 'PAID', bank_reference = ${bankReference.trim().slice(0, 80)}, paid_at = now()
    where id = ${payoutId} and status = 'PENDING'
    returning user_id, amount_cents
  `;
  const payout = rows[0];
  if (!payout) throw new Error("That payout is not pending.");
  const owner = await sql<{ email: string; email_bookings: boolean }>`
    select u.email, p.email_bookings from "user" u join profiles p on p.user_id = u.id where u.id = ${payout.user_id}
  `;
  await notifyUser({
    userId: payout.user_id,
    email: owner[0]?.email,
    emailOn: owner[0]?.email_bookings ?? true,
    template: "payout-sent",
    title: "Payout sent",
    body: `A payout of ${(payout.amount_cents / 100).toFixed(2)} was marked paid. Reference ${bankReference.trim()}.`,
    href: "/host/payouts",
  });
  await audit(profile.userId, "payout.paid", payoutId, { bankReference });
  return { ok: true as const };
}

export async function setVerified(userId: string, targetUserId: string, verified: boolean) {
  const profile = await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  await sql`update profiles set verified = ${verified}, updated_at = now() where user_id = ${targetUserId}`;
  await audit(profile.userId, verified ? "account.verify" : "account.unverify", targetUserId, {});
  return { ok: true as const };
}

export async function listAudit(userId: string) {
  await requireActive(userId, ["ADMIN"]);
  const sql = await getSql();
  return sql<{ id: string; action: string; target: string; created_at: string; actor: string }>`
    select a.id, a.action, a.target, a.created_at::text as created_at, coalesce(p.display_name, a.actor_user_id) as actor
    from audit_log a
    left join profiles p on p.user_id = a.actor_user_id
    order by a.created_at desc
    limit 100
  `;
}

export async function publicStay(slug: string) {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    select p.*, pr.display_name as host_name, pr.verified as host_verified,
           coalesce(rv.avg_rating, 0)::float8 as avg_rating,
           coalesce(rv.review_count, 0)::int as review_count
    from properties p
    join profiles pr on pr.user_id = p.owner_user_id
    left join (
      select property_id, avg(rating)::float8 as avg_rating, count(*)::int as review_count
      from reviews where hidden = false group by property_id
    ) rv on rv.property_id = p.id
    where p.slug = ${slug} and p.status = 'LIVE'
  `;
  const row = rows[0];
  if (!row) return null;
  await sql`
    insert into property_views (property_id, viewed_on, view_count)
    values (${String(row.id)}, current_date, 1)
    on conflict (property_id, viewed_on) do update set view_count = property_views.view_count + 1
  `;
  const media = await sql<{ id: string; kind: string; url: string; is_cover: boolean }>`
    select id, kind, url, is_cover from property_media
    where property_id = ${String(row.id)} order by is_cover desc, sort_order asc
  `;
  const reviews = await sql<{ id: string; rating: number; body: string; owner_reply: string | null; created_at: string }>`
    select id, rating, body, owner_reply, created_at::text as created_at
    from reviews where property_id = ${String(row.id)} and hidden = false
    order by created_at desc limit 20
  `;
  const blocked = await sql<{ day: string }>`
    select day::text as day from calendar_days
    where property_id = ${String(row.id)} and blocked = true and day >= current_date and day < current_date + 120
  `;
  const similar = await sql<{ slug: string; title: string; city: string; nightly_cents: number }>`
    select slug, title, city, nightly_cents from properties
    where status = 'LIVE' and id <> ${String(row.id)} and (city = ${String(row.city)} or property_type = ${String(row.property_type)})
    order by created_at desc limit 3
  `;
  const settings = await readSettings();
  const policy = settings.policies.find((item) => item.code === row.cancellation_policy);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    description: String(row.description ?? ""),
    propertyType: String(row.property_type),
    city: String(row.city ?? ""),
    region: String(row.region ?? ""),
    country: String(row.country ?? ""),
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    nightlyCents: Number(row.nightly_cents),
    weekendCents: row.weekend_cents == null ? null : Number(row.weekend_cents),
    cleaningFeeCents: Number(row.cleaning_fee_cents),
    securityDepositCents: Number(row.security_deposit_cents),
    maxGuests: Number(row.max_guests),
    bedrooms: Number(row.bedrooms),
    beds: Number(row.beds),
    bathrooms: Number(row.bathrooms),
    petsAllowed: Boolean(row.pets_allowed),
    instantBook: Boolean(row.instant_book),
    amenities: Array.isArray(row.amenities) ? row.amenities.map(String) : [],
    houseRules: String(row.house_rules ?? ""),
    checkInTime: String(row.check_in_time),
    checkOutTime: String(row.check_out_time),
    cancellationPolicy: String(row.cancellation_policy),
    cancellationSummary: policy?.summary ?? "",
    minNights: Number(row.min_nights ?? 1),
    maxNights: row.max_nights == null ? null : Number(row.max_nights),
    starRating: row.star_rating == null ? null : Number(row.star_rating),
    floorSqm: row.floor_sqm == null ? null : Number(row.floor_sqm),
    ceilingM: row.ceiling_m == null ? null : Number(row.ceiling_m),
    loadingDocks: Number(row.loading_docks ?? 0),
    truckParking: Number(row.truck_parking ?? 0),
    videoUrl: row.video_url == null ? null : String(row.video_url),
    tourUrl: row.tour_url == null ? null : String(row.tour_url),
    hostName: String(row.host_name),
    hostVerified: Boolean(row.host_verified),
    avgRating: Number(row.avg_rating) || 0,
    reviewCount: Number(row.review_count) || 0,
    currency: settings.currency,
    media,
    reviews,
    blockedDays: blocked.map((day) => day.day),
    similar,
  };
}

export async function liveSitemapSlugs() {
  const sql = await getSql();
  return sql<{ slug: string; updated_at: string }>`
    select slug, updated_at::text as updated_at from properties where status = 'LIVE' order by updated_at desc
  `;
}
