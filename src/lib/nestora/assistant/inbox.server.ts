import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import type { ChannelName } from "./settings.server.ts";

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  user_id: string | null;
  notes: string;
  tags: string;
  consent_sms: boolean;
  consent_whatsapp: boolean;
  opted_out: boolean;
};

const listeners = new Set<(data: string) => void>();

export function subscribeInbox(listener: (data: string) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishInbox(event: Record<string, unknown>) {
  const data = JSON.stringify(event);
  for (const listener of listeners) listener(data);
}

function phoneKey(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : digits ? `+${digits}` : "";
}

export async function matchContact(input: {
  channel: ChannelName;
  externalId: string;
  name?: string;
  phone?: string;
  email?: string;
}): Promise<Contact> {
  const sql = await getSql();
  const external = input.externalId.trim().toLowerCase();
  const byIdentity = await sql<{ contact_id: string }>`
    select contact_id from contact_identities where channel = ${input.channel} and external_id = ${external}
  `;
  let contactId = byIdentity[0]?.contact_id;
  const phone = input.phone ? phoneKey(input.phone) : "";
  const email = input.email?.trim().toLowerCase() || "";
  if (!contactId && phone) {
    const found = await sql<{ id: string }>`select id from contacts where phone = ${phone} limit 1`;
    contactId = found[0]?.id;
  }
  if (!contactId && email) {
    const found = await sql<{ id: string }>`select id from contacts where lower(email) = ${email} limit 1`;
    contactId = found[0]?.id;
  }
  if (!contactId) {
    contactId = randomUUID();
    await sql`
      insert into contacts (id, name, phone, email)
      values (${contactId}, ${input.name?.slice(0, 120) || ""}, ${phone || null}, ${email || null})
    `;
  } else {
    await sql`
      update contacts set
        name = case when name = '' then ${input.name?.slice(0, 120) || ""} else name end,
        phone = coalesce(phone, ${phone || null}),
        email = coalesce(email, ${email || null})
      where id = ${contactId}
    `;
  }
  await sql`
    insert into contact_identities (id, contact_id, channel, external_id)
    values (${randomUUID()}, ${contactId}, ${input.channel}, ${external})
    on conflict (channel, external_id) do nothing
  `;
  return loadContact(contactId);
}

export async function loadContact(id: string): Promise<Contact> {
  const sql = await getSql();
  const rows = await sql<Contact>`
    select id, name, phone, email, user_id, notes, tags, consent_sms, consent_whatsapp, opted_out
    from contacts where id = ${id}
  `;
  const row = rows[0];
  if (!row) throw new Error("Contact not found.");
  return row;
}

export async function openConversation(contactId: string, channel: ChannelName) {
  const sql = await getSql();
  const existing = await sql<{ id: string; mode: string; status: string }>`
    select id, mode, status from conversations where contact_id = ${contactId} order by last_message_at desc limit 1
  `;
  if (existing[0] && existing[0].status === "OPEN") return existing[0].id;
  const id = randomUUID();
  await sql`
    insert into conversations (id, contact_id, last_channel)
    values (${id}, ${contactId}, ${channel})
  `;
  return id;
}

export async function addMessage(input: {
  conversationId: string;
  channel: ChannelName | string;
  sender: "CUSTOMER" | "AI" | "ADMIN" | "SYSTEM";
  body: string;
  status?: string;
  externalId?: string | null;
  kind?: string;
  meta?: Record<string, unknown>;
}) {
  const sql = await getSql();
  if (input.externalId) {
    const dup = await sql<{ id: string }>`
      select id from conversation_messages where channel = ${input.channel} and external_id = ${input.externalId}
    `;
    if (dup[0]) return dup[0].id;
  }
  const id = randomUUID();
  await sql`
    insert into conversation_messages (id, conversation_id, channel, sender, body, status, external_id, kind, meta)
    values (
      ${id}, ${input.conversationId}, ${input.channel}, ${input.sender}, ${input.body.slice(0, 8000)},
      ${input.status ?? "SENT"}, ${input.externalId ?? null}, ${input.kind ?? "MESSAGE"},
      ${JSON.stringify(input.meta ?? {})}::jsonb
    )
  `;
  const preview = input.body.replace(/\s+/g, " ").slice(0, 140);
  await sql`
    update conversations set
      last_message_at = now(),
      last_preview = ${preview},
      last_channel = ${input.channel},
      unread = ${input.sender === "CUSTOMER"},
      last_customer_at = case when ${input.sender === "CUSTOMER"} then now() else last_customer_at end
    where id = ${input.conversationId}
  `;
  publishInbox({ type: "message", conversationId: input.conversationId, sender: input.sender });
  return id;
}

export async function recentTranscript(conversationId: string) {
  const sql = await getSql();
  const rows = await sql<{ sender: string; body: string }>`
    select sender, body from conversation_messages
    where conversation_id = ${conversationId} and kind = 'MESSAGE' and sender in ('CUSTOMER', 'AI')
    order by created_at desc limit 16
  `;
  return rows.reverse();
}

export async function rememberReceipt(source: string, id: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    insert into webhook_receipts (id, source) values (${`${source}:${id}`}, ${source})
    on conflict (id) do nothing returning id
  `;
  return rows.length > 0;
}

const ANGRY = /\b(furious|angry|terrible|worst|scam|refund now|unacceptable|disgusting)\b/i;

export function looksAngry(text: string): boolean {
  return ANGRY.test(text);
}

export async function flagAttention(conversationId: string, reason: string, sentiment?: string) {
  const sql = await getSql();
  await sql`
    update conversations set needs_attention = true, attention_reason = ${reason.slice(0, 200)},
      sentiment = coalesce(${sentiment ?? null}, sentiment), mode = 'HUMAN'
    where id = ${conversationId}
  `;
  publishInbox({ type: "attention", conversationId, reason });
}

export async function listInbox(filters: {
  q: string;
  channel: string;
  status: string;
  mode: string;
  unread: boolean;
  booked: string;
  sinceDays: number;
}) {
  const sql = await getSql();
  const where = ["true"];
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.status === "OPEN" || filters.status === "RESOLVED") where.push(`c.status = ${add(filters.status)}`);
  if (filters.mode === "AI" || filters.mode === "HUMAN") where.push(`c.mode = ${add(filters.mode)}`);
  if (filters.unread) where.push("c.unread = true");
  if (filters.booked === "yes") where.push("c.booked = true");
  if (filters.booked === "no") where.push("c.booked = false");
  if (filters.sinceDays > 0) where.push(`c.last_message_at >= now() - (${add(filters.sinceDays)}::int * interval '1 day')`);
  if (filters.channel) where.push(`c.last_channel = ${add(filters.channel)}`);
  if (filters.q.trim()) {
    const token = add(`%${filters.q.trim()}%`);
    where.push(`(ct.name ilike ${token} or ct.email ilike ${token} or ct.phone ilike ${token} or c.last_preview ilike ${token})`);
  }
  return sql.query<{
    id: string;
    status: string;
    mode: string;
    needs_attention: boolean;
    attention_reason: string | null;
    unread: boolean;
    booked: boolean;
    last_preview: string;
    last_channel: string;
    last_message_at: string;
    name: string;
    phone: string | null;
    email: string | null;
  }>(
    `select c.id, c.status, c.mode, c.needs_attention, c.attention_reason, c.unread, c.booked,
            c.last_preview, c.last_channel, c.last_message_at::text as last_message_at,
            ct.name, ct.phone, ct.email
     from conversations c join contacts ct on ct.id = c.contact_id
     where ${where.join(" and ")}
     order by c.needs_attention desc, c.last_message_at desc
     limit 100`,
    params,
  );
}
