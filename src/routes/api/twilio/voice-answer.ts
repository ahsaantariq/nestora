import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { verifyTwilioSignature } from "@/lib/nestora/assistant/sign";
import { readAssistantSettings, readSecrets } from "@/lib/nestora/assistant/settings.server";
import { matchContact, openConversation, addMessage } from "@/lib/nestora/assistant/inbox.server";

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

export const Route = createFileRoute("/api/twilio/voice-answer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = await readSecrets();
        const settings = await readAssistantSettings();
        const form = await request.formData();
        const params: Record<string, string> = {};
        for (const [key, value] of form.entries()) params[key] = String(value);
        const url = `${secrets.publicBaseUrl}${new URL(request.url).pathname}`;
        if (secrets.twilioAuthToken && !verifyTwilioSignature(url, params, request.headers.get("x-twilio-signature"), secrets.twilioAuthToken)) {
          return new Response("Invalid signature", { status: 403 });
        }
        const from = params.From || "";
        const to = params.To || "";
        const callSid = params.CallSid || randomUUID();
        if (from.startsWith("client:")) {
          const dest = to.replace(/[^\d+]/g, "");
          if (!dest || !secrets.twilioPhone) return xml("<Say>Browser calling is not ready.</Say>");
          return xml(`<Dial callerId="${secrets.twilioPhone}"><Number>${dest}</Number></Dial>`);
        }
        if (from) {
          const contact = await matchContact({ channel: "voice", externalId: from, phone: from });
          const conversationId = await openConversation(contact.id, "voice");
          const sql = await getSql();
          await sql`
            insert into assistant_calls (id, conversation_id, contact_id, direction, from_number, to_number, call_sid)
            values (${randomUUID()}, ${conversationId}, ${contact.id}, ${params.Direction === "outbound-api" ? "outbound" : "inbound"}, ${from}, ${to}, ${callSid})
            on conflict (call_sid) do nothing
          `;
          await addMessage({
            conversationId,
            channel: "voice",
            sender: "SYSTEM",
            kind: "CALL",
            body: `${params.Direction === "outbound-api" ? "Outbound" : "Inbound"} call ${from}`,
            meta: { callSid },
          });
        }
        if (!settings.voiceOn || !secrets.voicePublicUrl) {
          const dial = settings.humanPhone ? `<Say>Please hold for a teammate.</Say><Dial>${settings.humanPhone}</Dial>` : "<Say>Voice is not available right now.</Say>";
          return xml(dial);
        }
        const socket = secrets.voicePublicUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/relay";
        const notice = settings.recordingEnabled ? settings.recordingNotice : settings.greeting;
        const record = settings.recordingEnabled
          ? `<Start><Recording recordingStatusCallback="${secrets.publicBaseUrl}/api/twilio/voice-status"/></Start>`
          : "";
        return xml(
          `${record}<Connect action="${secrets.publicBaseUrl}/api/twilio/voice-handoff"><ConversationRelay url="${socket}" welcomeGreeting="${notice.replace(/[<>&]/g, "")}" /></Connect>`,
        );
      },
    },
  },
});
