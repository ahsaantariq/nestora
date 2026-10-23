import { getSql } from "@/lib/db";
import { assistantMayReply, replyAsAssistant } from "./brain.server.ts";
import { sendOnChannel } from "./channels.server.ts";
import { addMessage, flagAttention, looksAngry, matchContact, openConversation, rememberReceipt } from "./inbox.server.ts";
import { channelEnabled, readAssistantSettings, type ChannelName } from "./settings.server.ts";

export type Inbound = {
  channel: ChannelName;
  externalUserId: string;
  messageId: string;
  text: string;
  name?: string;
  phone?: string;
  email?: string;
  externalConversationId?: string;
  accountId?: string;
};

const STOP = /^(stop|stopall|unsubscribe|cancel|end|quit)$/i;
const HELP = /^(help|info)$/i;

export async function handleInbound(input: Inbound): Promise<string> {
  const fresh = await rememberReceipt(input.channel, input.messageId);
  if (!fresh) return "";
  const settings = await readAssistantSettings();
  const contact = await matchContact({
    channel: input.channel,
    externalId: input.externalUserId,
    name: input.name,
    phone: input.phone,
    email: input.email,
  });
  const conversationId = await openConversation(contact.id, input.channel);
  if (input.externalConversationId) {
    const sql = await getSql();
    await sql`
      insert into contact_identities (id, contact_id, channel, external_id)
      values (${`${conversationId}:zernio`}, ${contact.id}, ${`${input.channel}:thread`}, ${input.externalConversationId})
      on conflict (channel, external_id) do nothing
    `;
  }
  const text = input.text.trim();
  await addMessage({
    conversationId,
    channel: input.channel,
    sender: "CUSTOMER",
    body: text || "(empty message)",
    externalId: input.messageId,
    meta: { externalConversationId: input.externalConversationId, accountId: input.accountId },
  });
  if (contact.opted_out && STOP.test(text)) return "";
  if ((input.channel === "sms" || input.channel === "whatsapp") && STOP.test(text)) {
    const sql = await getSql();
    await sql`update contacts set opted_out = true where id = ${contact.id}`;
    const reply = "You are unsubscribed from Nestora messages. Reply START if you want to talk again.";
    await sendOnChannel({ conversationId, channel: input.channel, to: input.phone || input.externalUserId, text: reply, sender: "SYSTEM" });
    return reply;
  }
  if ((input.channel === "sms" || input.channel === "whatsapp") && /^start$/i.test(text)) {
    const sql = await getSql();
    await sql`update contacts set opted_out = false, consent_sms = true, consent_whatsapp = ${input.channel === "whatsapp"} where id = ${contact.id}`;
  }
  if ((input.channel === "sms" || input.channel === "whatsapp") && HELP.test(text)) {
    const reply = "Nestora can help you find a stay and pay by a secure link. Reply STOP to opt out. Message frequency varies.";
    await sendOnChannel({ conversationId, channel: input.channel, to: input.phone || input.externalUserId, text: reply, sender: "SYSTEM" });
    return reply;
  }
  if (contact.opted_out) return "";
  if (input.channel === "sms" || input.channel === "whatsapp") {
    const sql = await getSql();
    await sql`
      update contacts set consent_sms = case when ${input.channel === "sms"} then true else consent_sms end,
        consent_whatsapp = case when ${input.channel === "whatsapp"} then true else consent_whatsapp end
      where id = ${contact.id}
    `;
  }
  if (looksAngry(text)) {
    await flagAttention(conversationId, "The customer sounds upset.", "angry");
    const reply = "I hear you. A person on the Nestora team will take this from here.";
    await sendOnChannel({ conversationId, channel: input.channel, to: input.email || input.phone || input.externalUserId, text: reply, sender: "AI" });
    return reply;
  }
  const sql = await getSql();
  const mode = await sql<{ mode: string }>`select mode from conversations where id = ${conversationId}`;
  if (mode[0]?.mode === "HUMAN" || !channelEnabled(settings, input.channel) || !(await assistantMayReply(input.channel))) {
    return "";
  }
  const result = await replyAsAssistant({ conversationId, contactId: contact.id, channel: input.channel }, text);
  if (result.handoff) await flagAttention(conversationId, "The assistant handed this conversation to the team.");
  const sent = await sendOnChannel({
    conversationId,
    channel: input.channel,
    to: input.email || input.phone || input.externalUserId,
    text: result.text,
    sender: "AI",
    externalConversationId: input.externalConversationId,
    accountId: input.accountId,
  });
  if (sent.error) await flagAttention(conversationId, sent.error);
  return result.text;
}
