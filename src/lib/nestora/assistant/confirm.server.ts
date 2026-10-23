import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { sendMail } from "../mail.server.ts";
import { notifyUser } from "../mail.server.ts";
import { invoicePdf } from "./pdf.ts";
import { readSecrets } from "./settings.server.ts";
import { addMessage } from "./inbox.server.ts";
import { sendOnChannel } from "./channels.server.ts";
import { formatMoney } from "@/lib/domain/money.ts";
import type { ChannelName } from "./settings.server.ts";

export async function confirmAssistantBooking(bookingId: string) {
  const sql = await getSql();
  const claimed = await sql<{
    id: string;
    conversation_id: string | null;
    payment_channel: string | null;
    guest_name: string | null;
    title: string;
    check_in: string;
    check_out: string;
    total_cents: number;
    currency: string;
    customer_user_id: string;
    email: string;
    email_verified: boolean;
    check_in_instructions: string;
    owner_user_id: string;
    owner_email: string;
  }>`
    update bookings b set assistant_notified = true
    where b.id = ${bookingId} and b.status = 'CONFIRMED' and b.assistant_notified = false and b.conversation_id is not null
    returning b.id, b.conversation_id, b.payment_channel, b.guest_name,
      (select title from properties p where p.id = b.property_id) as title,
      b.check_in::text as check_in, b.check_out::text as check_out, b.total_cents, b.currency,
      b.customer_user_id,
      (select email from "user" u where u.id = b.customer_user_id) as email,
      (select "emailVerified" from "user" u where u.id = b.customer_user_id) as email_verified,
      (select check_in_instructions from properties p where p.id = b.property_id) as check_in_instructions,
      (select owner_user_id from properties p where p.id = b.property_id) as owner_user_id,
      (select email from "user" u where u.id = (select owner_user_id from properties p where p.id = b.property_id)) as owner_email
  `;
  const booking = claimed[0];
  if (!booking?.conversation_id) return;
  const secrets = await readSecrets();
  const base = secrets.publicBaseUrl || "";
  const token = randomUUID().replace(/-/g, "");
  await sql`
    insert into welcome_tokens (token, user_id, booking_id, email, expires_at)
    values (${token}, ${booking.customer_user_id}, ${booking.id}, ${booking.email}, now() + interval '7 days')
  `;
  if (booking.payment_channel === "email") {
    await sql`update "user" set "emailVerified" = true where id = ${booking.customer_user_id}`;
  }
  const tripUrl = `${base}/trips/${booking.id}`;
  const passwordUrl = `${base}/welcome?token=${token}`;
  const total = formatMoney(booking.total_cents, booking.currency?.toUpperCase() || "USD");
  const pdf = invoicePdf([
    "Nestora",
    "Booking receipt",
    booking.title,
    `${booking.check_in} to ${booking.check_out}`,
    `Guest: ${booking.guest_name || booking.email}`,
    `Total: ${total}`,
    `Booking: ${booking.id}`,
  ]);
  await sendMail({
    to: booking.email,
    template: "booking-invoice",
    subject: `Your Nestora booking is confirmed — ${booking.title}`,
    text: [
      `${booking.title} is confirmed for ${booking.check_in} to ${booking.check_out}.`,
      `Total ${total}.`,
      booking.check_in_instructions ? `Check-in: ${booking.check_in_instructions}` : "",
      `Set your password and open the booking: ${passwordUrl}`,
      `Your booking: ${tripUrl}`,
    ].filter(Boolean).join("\n"),
    attachments: [{ filename: "nestora-receipt.pdf", contentBase64: pdf, contentType: "application/pdf" }],
  });
  const channel = (booking.payment_channel || "web") as ChannelName;
  const contact = await sql<{ phone: string | null; email: string | null }>`
    select phone, email from contacts where id = (select contact_id from conversations where id = ${booking.conversation_id})
  `;
  const line = booking.email_verified
    ? `Your booking is confirmed. Sign in with ${booking.email} to see it at ${tripUrl}.`
    : `Your booking is confirmed. Your account has been created with ${booking.email}. Check your email to set your password and see your booking at ${tripUrl}.`;
  await sendOnChannel({
    conversationId: booking.conversation_id,
    channel,
    to: contact[0]?.email || contact[0]?.phone || booking.email,
    text: line,
    sender: "AI",
    kind: "BOOKING",
  });
  await addMessage({
    conversationId: booking.conversation_id,
    channel,
    sender: "SYSTEM",
    kind: "BOOKING",
    body: `Stripe confirmed payment for ${booking.title}.`,
    meta: { bookingId: booking.id },
  });
  await sql`update conversations set booked = true where id = ${booking.conversation_id}`;
  await sql`update assistant_calls set outcome = 'booked' where conversation_id = ${booking.conversation_id} and outcome = 'open'`;
  await notifyUser({
    userId: booking.owner_user_id,
    email: booking.owner_email,
    emailOn: true,
    template: "owner-booking",
    title: `New booking: ${booking.title}`,
    body: `${booking.guest_name || "A guest"} booked ${booking.check_in} to ${booking.check_out}.`,
    href: "/host/dashboard/bookings",
  });
}
