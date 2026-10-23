import { getSql } from "@/lib/db";
import { searchStays } from "../data.server.ts";
import { quoteStay, publicStay } from "../commerce.server.ts";
import { readAssistantSettings } from "./settings.server.ts";
import { createAssistantHold, createPaymentLink } from "./flow.server.ts";
import { flagAttention, loadContact } from "./inbox.server.ts";
import { formatMoney } from "@/lib/domain/money.ts";

export type ToolContext = {
  conversationId: string;
  contactId: string;
  channel: string;
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

async function search(input: Record<string, unknown>) {
  const location = String(input.location ?? "");
  const stays = await searchStays({
    location,
    type: ["HOTEL", "HOUSE", "APARTMENT", "WAREHOUSE"].includes(String(input.type)) ? (input.type as "HOTEL") : "",
    minCents: null,
    maxCents: typeof input.budgetCents === "number" ? input.budgetCents : null,
    guests: Number(input.guests ?? 0) || 0,
    bedrooms: 0,
    pets: Boolean(input.pets),
    instant: false,
    minRating: 0,
    amenities: Array.isArray(input.amenities) ? input.amenities.map(String).slice(0, 8) : [],
    sort: input.sort === "cheapest" ? "price_asc" : input.sort === "rating" ? "rating" : "newest",
  });
  const dated = [];
  for (const stay of stays.slice(0, 8)) {
    let quote: { totalCents: number; currency: string; lines: { label: string; cents: number }[] } | null = null;
    if (input.checkIn && input.checkOut) {
      try {
        quote = await quoteStay({
          slug: stay.slug,
          checkIn: String(input.checkIn),
          checkOut: String(input.checkOut),
          adults: Math.max(1, Number(input.adults ?? input.guests ?? 1)),
          children: Number(input.children ?? 0),
          infants: Number(input.infants ?? 0),
          petCount: input.pets ? Math.max(1, Number(input.petCount ?? 1)) : 0,
        });
      } catch (error) {
        dated.push({ slug: stay.slug, title: stay.title, unavailable: error instanceof Error ? error.message : "Unavailable" });
        continue;
      }
    }
    dated.push({
      slug: stay.slug,
      title: stay.title,
      city: stay.city,
      type: stay.propertyType,
      nightly: formatMoney(stay.nightlyCents),
      rating: stay.reviewCount > 0 ? stay.avgRating : null,
      reviews: stay.reviewCount,
      pets: stay.petsAllowed,
      quote: quote ? { total: formatMoney(quote.totalCents, quote.currency), lines: quote.lines } : null,
    });
  }
  const available = dated.filter((item) => !("unavailable" in item && item.unavailable));
  return { count: available.length, stays: available.slice(0, 3), skipped: dated.filter((item) => "unavailable" in item).slice(0, 5) };
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const sql = await getSql();
  if (name === "search_stays") return search(input);
  if (name === "get_property_details" || name === "get_policies") {
    const stay = await publicStay(String(input.slug ?? ""));
    if (!stay) return { found: false };
    if (name === "get_policies") {
      const extra = await sql<{ smoking_allowed: boolean; parties_allowed: boolean; children_allowed: boolean; quiet_hours: string }>`
        select smoking_allowed, parties_allowed, children_allowed, quiet_hours from properties where slug = ${stay.slug}
      `;
      return {
        title: stay.title,
        cancellation: stay.cancellationPolicy,
        cancellationSummary: stay.cancellationSummary,
        pets: stay.petsAllowed,
        houseRules: stay.houseRules,
        checkIn: stay.checkInTime,
        checkOut: stay.checkOutTime,
        smoking: Boolean(extra[0]?.smoking_allowed),
        parties: Boolean(extra[0]?.parties_allowed),
        children: extra[0]?.children_allowed !== false,
        quietHours: extra[0]?.quiet_hours ?? "",
      };
    }
    return {
      title: stay.title,
      slug: stay.slug,
      city: stay.city,
      summary: stay.summary,
      description: stay.description,
      type: stay.propertyType,
      guests: stay.maxGuests,
      bedrooms: stay.bedrooms,
      beds: stay.beds,
      baths: stay.bathrooms,
      nightlyCents: stay.nightlyCents,
      amenities: stay.amenities,
      pets: stay.petsAllowed,
      cancellation: stay.cancellationPolicy,
      houseRules: stay.houseRules,
    };
  }
  if (name === "check_availability" || name === "get_price_quote") {
    try {
      const quote = await quoteStay({
        slug: String(input.slug),
        checkIn: String(input.checkIn),
        checkOut: String(input.checkOut),
        adults: Math.max(1, Number(input.adults ?? 1)),
        children: Number(input.children ?? 0),
        infants: Number(input.infants ?? 0),
        petCount: Number(input.petCount ?? 0),
      });
      return {
        available: true,
        title: quote.title,
        totalCents: quote.totalCents,
        total: formatMoney(quote.totalCents, quote.currency),
        currency: quote.currency,
        lines: quote.lines,
        cancellation: quote.cancellationPolicy,
      };
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : "Not available" };
    }
  }
  if (name === "find_nearby_alternatives") {
    const stays = await searchStays({
      location: "",
      type: "",
      minCents: null,
      maxCents: null,
      guests: Number(input.guests ?? 0) || 0,
      bedrooms: 0,
      pets: Boolean(input.pets),
      instant: false,
      minRating: 0,
      amenities: [],
      sort: "newest",
    });
    const wanted = String(input.location ?? "").trim().toLowerCase();
    const origin = stays.find((stay) => stay.city.toLowerCase() === wanted && stay.lat != null && stay.lng != null);
    const others = stays.filter((stay) => stay.city.toLowerCase() !== wanted).slice(0, 3);
    return {
      requested: wanted,
      note: "These are not in the requested city. If distanceKm is null, say you do not know the distance.",
      stays: others.map((stay) => ({
        slug: stay.slug,
        title: stay.title,
        city: stay.city,
        country: stay.country,
        nightly: formatMoney(stay.nightlyCents),
        distanceKm: origin && stay.lat != null && stay.lng != null && origin.lat != null && origin.lng != null
          ? haversineKm(origin.lat, origin.lng, stay.lat, stay.lng)
          : null,
      })),
    };
  }
  if (name === "create_booking_hold") {
    if (input.emailConfirmed !== true) return { error: "Read the email back and wait until the customer confirms it before holding dates." };
    const settings = await readAssistantSettings();
    const requested = Number(input.discountBps ?? 0);
    if (requested > 0 && !settings.discountEnabled) return { error: "Discounts are not enabled. Quote the full price." };
    const discountBps = settings.discountEnabled ? Math.min(settings.maxDiscountBps, Math.max(0, requested)) : 0;
    try {
      const hold = await createAssistantHold({
        slug: String(input.slug),
        checkIn: String(input.checkIn),
        checkOut: String(input.checkOut),
        adults: Math.max(1, Number(input.adults ?? 1)),
        children: Number(input.children ?? 0),
        infants: Number(input.infants ?? 0),
        petCount: Number(input.petCount ?? 0),
        name: String(input.name ?? ""),
        phone: String(input.phone ?? ""),
        email: String(input.email ?? ""),
        conversationId: ctx.conversationId,
        channel: ctx.channel,
        discountBps,
      });
      return hold;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not hold those dates." };
    }
  }
  if (name === "create_payment_link" || name === "resend_payment_link") {
    try {
      const link = await createPaymentLink(String(input.bookingId));
      return { url: link.url, bookingId: link.bookingId, note: "Payment is confirmed only by Stripe, never because the customer says they paid." };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not create a payment link." };
    }
  }
  if (name === "get_booking_status") {
    const contact = await loadContact(ctx.contactId);
    const rows = await sql<{ id: string; status: string; title: string; check_in: string; check_out: string; total_cents: number; payment_url: string | null }>`
      select b.id, b.status, p.title, b.check_in::text as check_in, b.check_out::text as check_out, b.total_cents, b.payment_url
      from bookings b join properties p on p.id = b.property_id
      where b.customer_user_id = ${contact.user_id ?? ""} or b.conversation_id = ${ctx.conversationId}
      order by b.created_at desc limit 5
    `;
    return { bookings: rows };
  }
  if (name === "lookup_customer" || name === "create_or_find_customer_account") {
    const contact = await loadContact(ctx.contactId);
    return {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      hasAccount: Boolean(contact.user_id),
      note: "Do not say an account was created until payment is confirmed by Stripe.",
    };
  }
  if (name === "handoff_to_human") {
    await flagAttention(ctx.conversationId, String(input.reason ?? "The customer needs a person."));
    return { handedOff: true };
  }
  return { error: `Unknown tool ${name}` };
}

export const ASSISTANT_TOOLS = [
  { name: "search_stays", description: "Search live stays. Returns only database rows. Empty means nothing matched.", input_schema: { type: "object", properties: { location: { type: "string" }, checkIn: { type: "string" }, checkOut: { type: "string" }, guests: { type: "number" }, adults: { type: "number" }, children: { type: "number" }, infants: { type: "number" }, pets: { type: "boolean" }, petCount: { type: "number" }, budgetCents: { type: "number" }, type: { type: "string" }, amenities: { type: "array", items: { type: "string" } }, sort: { type: "string", enum: ["cheapest", "rating", "featured"] } } } },
  { name: "get_property_details", description: "Facts for one live stay by slug.", input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
  { name: "check_availability", description: "Whether exact dates can be booked, from the calendar.", input_schema: { type: "object", properties: { slug: { type: "string" }, checkIn: { type: "string" }, checkOut: { type: "string" }, adults: { type: "number" }, children: { type: "number" }, infants: { type: "number" }, petCount: { type: "number" } }, required: ["slug", "checkIn", "checkOut"] } },
  { name: "get_price_quote", description: "Full price breakdown for dates. Use these numbers only.", input_schema: { type: "object", properties: { slug: { type: "string" }, checkIn: { type: "string" }, checkOut: { type: "string" }, adults: { type: "number" }, children: { type: "number" }, infants: { type: "number" }, petCount: { type: "number" } }, required: ["slug", "checkIn", "checkOut"] } },
  { name: "find_nearby_alternatives", description: "Other live cities when the requested place has nothing. Never invent a distance.", input_schema: { type: "object", properties: { location: { type: "string" }, guests: { type: "number" }, pets: { type: "boolean" } }, required: ["location"] } },
  { name: "get_policies", description: "Cancellation, pets, house rules, and check-in for one stay.", input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
  { name: "create_booking_hold", description: "Hold dates for 30 minutes after the customer confirms their email.", input_schema: { type: "object", properties: { slug: { type: "string" }, checkIn: { type: "string" }, checkOut: { type: "string" }, adults: { type: "number" }, children: { type: "number" }, infants: { type: "number" }, petCount: { type: "number" }, name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, emailConfirmed: { type: "boolean" }, discountBps: { type: "number" } }, required: ["slug", "checkIn", "checkOut", "name", "phone", "email", "emailConfirmed"] } },
  { name: "create_payment_link", description: "Stripe Checkout link for a hold. Expires with the hold.", input_schema: { type: "object", properties: { bookingId: { type: "string" } }, required: ["bookingId"] } },
  { name: "resend_payment_link", description: "Send the payment link again if the hold is still open.", input_schema: { type: "object", properties: { bookingId: { type: "string" } }, required: ["bookingId"] } },
  { name: "get_booking_status", description: "Status of this customer's bookings only.", input_schema: { type: "object", properties: {} } },
  { name: "lookup_customer", description: "This conversation's contact only. Never another customer.", input_schema: { type: "object", properties: {} } },
  { name: "create_or_find_customer_account", description: "Whether this contact already has an account. Do not announce account creation before payment.", input_schema: { type: "object", properties: {} } },
  { name: "handoff_to_human", description: "Pause the assistant and flag the conversation for the team. Use for cancellations, refunds, and uncertainty.", input_schema: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } },
];
