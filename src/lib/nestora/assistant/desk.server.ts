import { createHmac, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { requireActive } from "../data.server.ts";
import { writeAudit } from "../audit.server.ts";
import { readSecrets, setChannelStatus } from "./settings.server.ts";
import { sendOnChannel } from "./channels.server.ts";
import { createAssistantHold, createPaymentLink } from "./flow.server.ts";
import { publishInbox } from "./inbox.server.ts";
import type { ChannelName } from "./settings.server.ts";

type ThreadMessage = {
  id: string;
  channel: string;
  sender: string;
  body: string;
  status: string;
  kind: string;
  created_at: string;
  url: string;
};

type ThreadCall = {
  id: string;
  direction: string;
  recording_url: string | null;
  transcript: string;
  summary: string;
  duration_seconds: number;
  outcome: string;
};

type ContactRow = {
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

export async function thread(actorId: string, conversationId: string) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const conversations = await sql<{
    id: string;
    status: string;
    mode: string;
    needs_attention: boolean;
    attention_reason: string | null;
    assigned_user_id: string | null;
    contact_id: string;
    last_customer_at: string | null;
  }>`
    select id, status, mode, needs_attention, attention_reason, assigned_user_id, contact_id, last_customer_at::text as last_customer_at
    from conversations where id = ${conversationId}
  `;
  const conversation = conversations[0];
  if (!conversation) throw new Error("Conversation not found.");
  const contacts = await sql<ContactRow>`
    select id, name, phone, email, user_id, notes, tags, consent_sms, consent_whatsapp, opted_out
    from contacts where id = ${conversation.contact_id}
  `;
  const contact = contacts[0];
  if (!contact) throw new Error("Contact not found.");
  const identities = await sql<{ channel: string; external_id: string }>`
    select channel, external_id from contact_identities where contact_id = ${conversation.contact_id}
  `;
  const rawMessages = await sql<{
    id: string;
    channel: string;
    sender: string;
    body: string;
    status: string;
    kind: string;
    created_at: string;
    meta: unknown;
  }>`
    select id, channel, sender, body, status, kind, meta, created_at::text as created_at
    from conversation_messages where conversation_id = ${conversationId}
    order by created_at asc limit 300
  `;
  const messages: ThreadMessage[] = rawMessages.map((message) => {
    const meta = message.meta && typeof message.meta === "object" ? message.meta as { url?: unknown } : {};
    return {
      id: message.id,
      channel: message.channel,
      sender: message.sender,
      body: message.body,
      status: message.status,
      kind: message.kind,
      created_at: message.created_at,
      url: typeof meta.url === "string" ? meta.url : "",
    };
  });
  const bookings = await sql<{ id: string; status: string; check_in: string; check_out: string; total_cents: number; payment_url: string | null }>`
    select id, status, check_in::text as check_in, check_out::text as check_out, total_cents, payment_url
    from bookings where conversation_id = ${conversationId} or customer_user_id = ${contact.user_id ?? ""}
    order by created_at desc limit 8
  `;
  const calls = await sql<ThreadCall>`
    select id, direction, recording_url, transcript, summary, duration_seconds, outcome
    from assistant_calls where conversation_id = ${conversationId}
    order by created_at desc limit 20
  `;
  await sql`update conversations set unread = false where id = ${conversationId}`;
  return { conversation, contact, identities, messages, bookings, calls };
}

export async function adminSend(actorId: string, input: { conversationId: string; channel: ChannelName; text: string; templateName?: string }) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ contact_id: string }>`select contact_id from conversations where id = ${input.conversationId}`;
  const contactId = rows[0]?.contact_id;
  if (!contactId) throw new Error("Conversation not found.");
  const contact = (await sql<{ phone: string | null; email: string | null }>`select phone, email from contacts where id = ${contactId}`)[0];
  const threadId = await sql<{ external_id: string }>`
    select external_id from contact_identities where contact_id = ${contactId} and channel = ${`${input.channel}:thread`} limit 1
  `;
  const template = input.templateName
    ? (await sql<{ name: string; language: string; body: string; approved: boolean }>`
        select name, language, body, approved from message_templates where channel = ${input.channel} and name = ${input.templateName}
      `)[0]
    : undefined;
  if (input.templateName && !template?.approved) throw new Error("That template is not marked approved.");
  const result = await sendOnChannel({
    conversationId: input.conversationId,
    channel: input.channel,
    to: contact?.email || contact?.phone || "",
    text: template?.body || input.text,
    sender: "ADMIN",
    externalConversationId: threadId[0]?.external_id,
    template: template ? { name: template.name, language: template.language } : undefined,
  });
  if (result.error) throw new Error(result.error);
  await writeAudit(actor.userId, "assistant.reply", input.conversationId, { channel: input.channel });
  return { ok: true as const };
}

export async function setMode(actorId: string, conversationId: string, mode: "AI" | "HUMAN") {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  await sql`
    update conversations set mode = ${mode}, needs_attention = case when ${mode === "AI"} then false else needs_attention end
    where id = ${conversationId}
  `;
  if (mode === "HUMAN") {
    await sql`update assistant_calls set outcome = 'handed_off' where conversation_id = ${conversationId} and outcome = 'open'`;
  }
  await writeAudit(actor.userId, mode === "HUMAN" ? "assistant.takeover" : "assistant.handback", conversationId, {});
  publishInbox({ type: "mode", conversationId, mode });
  return { ok: true as const };
}

export async function setAssignment(actorId: string, conversationId: string, assignee: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  await sql`update conversations set assigned_user_id = ${assignee || null} where id = ${conversationId}`;
  await writeAudit(actor.userId, "assistant.assign", conversationId, { assignee });
  return { ok: true as const };
}

export async function setResolved(actorId: string, conversationId: string, resolved: boolean) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  await sql`update conversations set status = ${resolved ? "RESOLVED" : "OPEN"} where id = ${conversationId}`;
  await writeAudit(actor.userId, resolved ? "assistant.resolve" : "assistant.reopen", conversationId, {});
  return { ok: true as const };
}

export async function addInternalNote(actorId: string, conversationId: string, body: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const { addMessage } = await import("./inbox.server.ts");
  await addMessage({ conversationId, channel: "web", sender: "ADMIN", kind: "NOTE", body, status: "INTERNAL" });
  await writeAudit(actor.userId, "assistant.note", conversationId, {});
  return { ok: true as const };
}

export async function mergeContacts(actorId: string, keepId: string, dropId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  if (keepId === dropId) throw new Error("Pick two different contacts.");
  const sql = await getSql();
  const drops = await sql<ContactRow>`
    select id, name, phone, email, user_id, notes, tags, consent_sms, consent_whatsapp, opted_out
    from contacts where id = ${dropId}
  `;
  const drop = drops[0];
  if (!drop) throw new Error("That contact was not found.");
  const identities = await sql<{ id: string; channel: string; external_id: string }>`
    select id, channel, external_id from contact_identities where contact_id = ${dropId}
  `;
  const conversations = await sql<{ id: string }>`select id from conversations where contact_id = ${dropId}`;
  const calls = await sql<{ id: string }>`select id from assistant_calls where contact_id = ${dropId}`;
  await sql`
    insert into contact_merges (id, keep_id, drop_id, drop_snapshot)
    values (${randomUUID()}, ${keepId}, ${dropId}, ${JSON.stringify({ contact: drop, identities, conversationIds: conversations.map((row) => row.id), callIds: calls.map((row) => row.id) })}::jsonb)
  `;
  await sql`update contact_identities set contact_id = ${keepId} where contact_id = ${dropId}`;
  await sql`update conversations set contact_id = ${keepId} where contact_id = ${dropId}`;
  await sql`update assistant_calls set contact_id = ${keepId} where contact_id = ${dropId}`;
  await sql`delete from contacts where id = ${dropId}`;
  await writeAudit(actor.userId, "assistant.merge", keepId, { dropped: dropId });
  return { ok: true as const };
}

export async function unmergeContacts(actorId: string, keepId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const rows = await sql<{ id: string; drop_id: string; drop_snapshot: unknown }>`
    select id, drop_id, drop_snapshot from contact_merges
    where keep_id = ${keepId} and undone_at is null
    order by created_at desc limit 1
  `;
  const row = rows[0];
  if (!row || !row.drop_snapshot || typeof row.drop_snapshot !== "object") throw new Error("Nothing to unmerge on this contact.");
  const snap = row.drop_snapshot as {
    contact?: ContactRow;
    identities?: { id: string }[];
    conversationIds?: string[];
    callIds?: string[];
  };
  const contact = snap.contact;
  if (!contact?.id) throw new Error("That merge cannot be undone.");
  await sql`
    insert into contacts (id, name, phone, email, user_id, notes, tags, consent_sms, consent_whatsapp, opted_out)
    values (${contact.id}, ${contact.name}, ${contact.phone}, ${contact.email}, ${contact.user_id}, ${contact.notes}, ${contact.tags}, ${contact.consent_sms}, ${contact.consent_whatsapp}, ${contact.opted_out})
    on conflict (id) do nothing
  `;
  for (const identity of snap.identities ?? []) {
    await sql`update contact_identities set contact_id = ${contact.id} where id = ${identity.id}`;
  }
  for (const id of snap.conversationIds ?? []) {
    await sql`update conversations set contact_id = ${contact.id} where id = ${id}`;
  }
  for (const id of snap.callIds ?? []) {
    await sql`update assistant_calls set contact_id = ${contact.id} where id = ${id}`;
  }
  await sql`update contact_merges set undone_at = now() where id = ${row.id}`;
  await writeAudit(actor.userId, "assistant.unmerge", keepId, { restored: contact.id });
  return { ok: true as const, restoredId: contact.id };
}

export async function deleteContactData(actorId: string, contactId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  await sql`delete from assistant_calls where contact_id = ${contactId}`;
  await sql`delete from contacts where id = ${contactId}`;
  await writeAudit(actor.userId, "assistant.delete-contact", contactId, {});
  return { ok: true as const };
}

type TemplateRow = { id: string; channel: string; name: string; language: string; body: string; approved: boolean };

async function templateRows() {
  const sql = await getSql();
  return sql<TemplateRow>`select id, channel, name, language, body, approved from message_templates order by channel, name`;
}

export async function saveTemplate(actorId: string, input: { id?: string; channel: string; name: string; language: string; body: string; approved: boolean }) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const id = input.id || randomUUID();
  await sql`
    insert into message_templates (id, channel, name, language, body, approved)
    values (${id}, ${input.channel}, ${input.name}, ${input.language || "en"}, ${input.body}, ${input.approved})
    on conflict (channel, name, language) do update set body = excluded.body, approved = excluded.approved
  `;
  return templateRows();
}

export async function deleteTemplate(actorId: string, id: string) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  await sql`delete from message_templates where id = ${id}`;
  return templateRows();
}

export async function listTemplates(actorId: string) {
  await requireActive(actorId, ["ADMIN"]);
  return templateRows();
}

export async function listCalls(actorId: string) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  return sql<{
    id: string;
    direction: string;
    from_number: string | null;
    to_number: string | null;
    recording_url: string | null;
    transcript: string;
    summary: string;
    duration_seconds: number;
    outcome: string;
    cost_cents: number;
    created_at: string;
  }>`
    select id, direction, from_number, to_number, recording_url, transcript, summary, duration_seconds, outcome, cost_cents, created_at::text as created_at
    from assistant_calls order by created_at desc limit 100
  `;
}

export async function assistantAnalytics(actorId: string) {
  await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  const totals = await sql<{ conversations: number; handed: number; booked: number; ai_resolved: number; revenue: number; cost: number }>`
    select
      (select count(*)::int from conversations) as conversations,
      (select count(*)::int from conversations where mode = 'HUMAN' or needs_attention) as handed,
      (select count(*)::int from conversations where booked) as booked,
      (select count(*)::int from conversations where mode = 'AI' and status = 'RESOLVED') as ai_resolved,
      (select coalesce(sum(total_cents), 0)::int from bookings where conversation_id is not null and status in ('CONFIRMED','CHECKED_IN','COMPLETED')) as revenue,
      (select coalesce(sum(cost_cents), 0)::int from ai_usage where created_at >= date_trunc('month', now())) as cost
  `;
  const speed = await sql<{ seconds: number }>`
    select coalesce(avg(extract(epoch from (reply.created_at - m.created_at))), 0)::int as seconds
    from conversation_messages m
    join lateral (
      select created_at from conversation_messages n
      where n.conversation_id = m.conversation_id and n.created_at > m.created_at and n.sender in ('AI', 'ADMIN')
      order by n.created_at limit 1
    ) reply on true
    where m.sender = 'CUSTOMER'
  `;
  const byChannel = await sql<{ channel: string; n: number }>`
    select last_channel as channel, count(*)::int as n from conversations group by last_channel order by n desc
  `;
  const row = totals[0];
  return {
    totals: {
      conversations: row?.conversations ?? 0,
      handed: row?.handed ?? 0,
      booked: row?.booked ?? 0,
      aiResolved: row?.ai_resolved ?? 0,
      revenue: row?.revenue ?? 0,
      cost: row?.cost ?? 0,
      responseSeconds: speed[0]?.seconds ?? 0,
    },
    byChannel,
  };
}

export async function manualHold(actorId: string, input: {
  conversationId: string;
  slug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  name: string;
  phone: string;
  email: string;
  channel: ChannelName;
}) {
  await requireActive(actorId, ["ADMIN"]);
  const hold = await createAssistantHold({
    ...input,
    children: 0,
    infants: 0,
    petCount: 0,
    discountBps: 0,
  });
  const link = await createPaymentLink(hold.bookingId);
  const sql = await getSql();
  const contact = await sql<{ phone: string | null; email: string | null }>`
    select phone, email from contacts where id = (select contact_id from conversations where id = ${input.conversationId})
  `;
  await sendOnChannel({
    conversationId: input.conversationId,
    channel: input.channel,
    to: contact[0]?.email || contact[0]?.phone || input.email,
    text: `Here is the payment link for ${hold.title}: ${link.url}`,
    sender: "ADMIN",
  });
  return { bookingId: hold.bookingId, url: link.url };
}

export async function placeOutboundCall(actorId: string, to: string) {
  await requireActive(actorId, ["ADMIN"]);
  const secrets = await readSecrets();
  if (!secrets.twilioAccountSid || !secrets.twilioAuthToken || !secrets.twilioPhone) throw new Error("Connect Twilio and a phone number first.");
  if (!secrets.publicBaseUrl) throw new Error("Set the public site URL first.");
  const body = new URLSearchParams({
    To: to,
    From: secrets.twilioPhone,
    Url: `${secrets.publicBaseUrl}/api/twilio/voice-answer`,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioAccountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secrets.twilioAccountSid}:${secrets.twilioAuthToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok) throw new Error(json.message || "Twilio did not start the call.");
  return { sid: json.sid };
}

export function browserCallToken(identity: string, secrets: Awaited<ReturnType<typeof readSecrets>>) {
  if (!secrets.twilioAccountSid || !secrets.twilioApiKey || !secrets.twilioApiSecret || !secrets.twilioTwimlAppSid) {
    throw new Error("Add the Twilio API key, secret, and TwiML app SID for browser calling.");
  }
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", cty: "twilio-fpa;v=1" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    jti: `${secrets.twilioApiKey}-${now}`,
    iss: secrets.twilioApiKey,
    sub: secrets.twilioAccountSid,
    nbf: now,
    exp: now + 3600,
    grants: {
      identity,
      voice: { outgoing: { application_sid: secrets.twilioTwimlAppSid }, incoming: { allow: true } },
    },
  })).toString("base64url");
  const sig = createHmac("sha256", secrets.twilioApiSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export async function testChannel(actorId: string, channel: "anthropic" | "twilio" | "zernio" | "imap") {
  await requireActive(actorId, ["ADMIN"]);
  const secrets = await readSecrets();
  try {
    if (channel === "anthropic") {
      if (!secrets.anthropicKey) throw new Error("Add the Anthropic API key.");
      const response = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": secrets.anthropicKey, "anthropic-version": "2023-06-01" },
      });
      if (!response.ok) throw new Error("Anthropic did not accept that key.");
    } else if (channel === "twilio") {
      if (!secrets.twilioAccountSid || !secrets.twilioAuthToken) throw new Error("Add the Twilio SID and auth token.");
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioAccountSid}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${secrets.twilioAccountSid}:${secrets.twilioAuthToken}`).toString("base64")}` },
      });
      if (!response.ok) throw new Error("Twilio did not accept those credentials.");
    } else if (channel === "zernio") {
      if (!secrets.zernioApiKey) throw new Error("Add the Zernio API key.");
      const response = await fetch("https://zernio.com/api/v1/accounts", {
        headers: { Authorization: `Bearer ${secrets.zernioApiKey}` },
      });
      if (!response.ok) throw new Error("Zernio did not accept that key.");
    } else {
      if (!secrets.imapHost || !secrets.imapUsername || !secrets.imapPassword) throw new Error("Add the IMAP host, username, and password.");
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: secrets.imapHost,
        port: secrets.imapPort || 993,
        secure: secrets.imapSecure,
        auth: { user: secrets.imapUsername, pass: secrets.imapPassword },
        logger: false,
      });
      await client.connect();
      await client.logout();
    }
    await setChannelStatus(channel, true);
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed.";
    await setChannelStatus(channel, false, message);
    throw new Error(message);
  }
}
