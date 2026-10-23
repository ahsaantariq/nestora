import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { sendMail } from "../mail.server.ts";
import { readSecrets, type ChannelName } from "./settings.server.ts";
import { addMessage } from "./inbox.server.ts";

export type Outbound = {
  conversationId: string;
  channel: ChannelName;
  to: string;
  text: string;
  accountId?: string;
  externalConversationId?: string;
  template?: { name: string; language: string };
  messageId?: string;
};

async function lastCustomerAt(conversationId: string): Promise<Date | null> {
  const sql = await getSql();
  const rows = await sql<{ last_customer_at: string | null }>`
    select last_customer_at::text as last_customer_at from conversations where id = ${conversationId}
  `;
  const raw = rows[0]?.last_customer_at;
  return raw ? new Date(raw) : null;
}

function windowClosed(at: Date | null): boolean {
  if (!at) return false;
  return Date.now() - at.getTime() > 24 * 60 * 60 * 1000;
}

async function twilioSend(channel: "sms" | "whatsapp", to: string, text: string, contentSid?: string) {
  const secrets = await readSecrets();
  if (!secrets.twilioAccountSid || !secrets.twilioAuthToken) throw new Error("Twilio is not connected.");
  const from = channel === "whatsapp" ? `whatsapp:${secrets.twilioWhatsapp.replace(/^whatsapp:/, "")}` : secrets.twilioPhone;
  const dest = channel === "whatsapp" ? `whatsapp:${to.replace(/^whatsapp:/, "")}` : to;
  if (!from || from.endsWith(":")) throw new Error(channel === "whatsapp" ? "Add the WhatsApp sender number." : "Add the Twilio phone number.");
  const body = contentSid
    ? new URLSearchParams({ To: dest, From: from, ContentSid: contentSid })
    : new URLSearchParams({ To: dest, From: from, Body: text.slice(0, 1500) });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secrets.twilioAccountSid}:${secrets.twilioAuthToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok) throw new Error(json.message || "Twilio did not send that message.");
  return json.sid || "";
}

async function zernioSend(input: Outbound) {
  const secrets = await readSecrets();
  if (!secrets.zernioApiKey) throw new Error("Zernio is not connected.");
  if (!input.externalConversationId) throw new Error("This thread has no Zernio conversation id yet.");
  const accountId = input.accountId || (input.channel === "instagram" ? secrets.zernioInstagramAccountId : secrets.zernioFacebookAccountId);
  if (!accountId) throw new Error(`Add the Zernio ${input.channel} account id in Integrations.`);
  const closed = windowClosed(await lastCustomerAt(input.conversationId));
  const payload: Record<string, unknown> = { accountId, message: input.text.slice(0, 2000) };
  if (closed) {
    if (input.template) {
      payload.template = { elements: [{ name: input.template.name, language: input.template.language, components: [] }] };
      delete payload.message;
    } else if (input.channel === "messenger" || input.channel === "instagram") {
      payload.messagingType = "MESSAGE_TAG";
      payload.messageTag = "HUMAN_AGENT";
    } else {
      throw new Error("WhatsApp is outside the 24-hour window. Send an approved template.");
    }
  }
  const response = await fetch(`https://zernio.com/api/v1/inbox/conversations/${encodeURIComponent(input.externalConversationId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets.zernioApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.messageId || randomUUID(),
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as { message?: string; error?: string; code?: string; data?: { messageId?: string } };
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("The platform will not allow this reply outside the messaging window. Use an approved template or message tag.");
    }
    throw new Error(json.message || json.error || `Zernio returned ${response.status}.`);
  }
  return json.data?.messageId || "";
}

export async function deliverOutbound(input: Outbound): Promise<{ status: string; externalId: string; error?: string }> {
  try {
    if (input.channel === "sms" || input.channel === "whatsapp") {
      if (input.channel === "whatsapp" && windowClosed(await lastCustomerAt(input.conversationId)) && !input.template) {
        throw new Error("WhatsApp is outside the 24-hour window. Pick an approved template.");
      }
      const sid = await twilioSend(input.channel, input.to, input.text, input.channel === "whatsapp" ? input.template?.name : undefined);
      return { status: "SENT", externalId: sid };
    }
    if (input.channel === "messenger" || input.channel === "instagram") {
      const id = await zernioSend(input);
      return { status: "SENT", externalId: id };
    }
    if (input.channel === "email") {
      const id = randomUUID();
      await sendMail({
        to: input.to,
        template: "assistant-email",
        subject: "Nestora",
        text: input.text,
        headers: { "Message-ID": `<${id}@nestora>` },
      });
      return { status: "SENT", externalId: id };
    }
    return { status: "SENT", externalId: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message was not sent.";
    return { status: "FAILED", externalId: "", error: message };
  }
}

export async function sendOnChannel(input: Outbound & { sender: "AI" | "ADMIN" | "SYSTEM"; kind?: string }) {
  const result = await deliverOutbound(input);
  await addMessage({
    conversationId: input.conversationId,
    channel: input.channel,
    sender: input.sender,
    body: result.error ? `${input.text}\n\n(${result.error})` : input.text,
    status: result.status,
    externalId: result.externalId || null,
    kind: input.kind,
  });
  return result;
}
