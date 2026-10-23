import { createFileRoute } from "@tanstack/react-router";
import { verifyTwilioSignature } from "@/lib/nestora/assistant/sign";
import { readSecrets } from "@/lib/nestora/assistant/settings.server";
import { handleInbound } from "@/lib/nestora/assistant/inbound.server";

export const Route = createFileRoute("/api/twilio/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = await readSecrets();
        const form = await request.formData();
        const params: Record<string, string> = {};
        for (const [key, value] of form.entries()) params[key] = String(value);
        const url = `${secrets.publicBaseUrl}${new URL(request.url).pathname}`;
        if (!verifyTwilioSignature(url, params, request.headers.get("x-twilio-signature"), secrets.twilioAuthToken)) {
          return new Response("Invalid signature", { status: 403 });
        }
        const from = (params.From || "").replace(/^whatsapp:/, "");
        await handleInbound({
          channel: "whatsapp",
          externalUserId: from,
          messageId: params.MessageSid || `wa-${Date.now()}`,
          text: params.Body || (params.NumMedia && params.NumMedia !== "0" ? "Sent an attachment" : ""),
          phone: from,
          name: params.ProfileName,
        });
        return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
      },
    },
  },
});
