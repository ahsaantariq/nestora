import { createFileRoute } from "@tanstack/react-router";
import { readAssistantSettings, readSecrets } from "@/lib/nestora/assistant/settings.server";
import { verifyTwilioSignature } from "@/lib/nestora/assistant/sign";

export const Route = createFileRoute("/api/twilio/voice-handoff")({
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
        const dial = settings.humanPhone
          ? `<Say>Let me connect you with a team member.</Say><Dial>${settings.humanPhone}</Dial>`
          : "<Say>A teammate will call you back.</Say>";
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${dial}</Response>`, {
          headers: { "Content-Type": "text/xml" },
        });
      },
    },
  },
});
