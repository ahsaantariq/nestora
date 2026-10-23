import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { verifyTwilioSignature } from "@/lib/nestora/assistant/sign";
import { readSecrets } from "@/lib/nestora/assistant/settings.server";

export const Route = createFileRoute("/api/twilio/voice-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = await readSecrets();
        const form = await request.formData();
        const params: Record<string, string> = {};
        for (const [key, value] of form.entries()) params[key] = String(value);
        const url = `${secrets.publicBaseUrl}${new URL(request.url).pathname}`;
        if (secrets.twilioAuthToken && !verifyTwilioSignature(url, params, request.headers.get("x-twilio-signature"), secrets.twilioAuthToken)) {
          return new Response("Invalid signature", { status: 403 });
        }
        const sql = await getSql();
        if (params.RecordingUrl && params.CallSid) {
          await sql`update assistant_calls set recording_url = ${params.RecordingUrl} where call_sid = ${params.CallSid}`;
        }
        if (params.CallDuration && params.CallSid) {
          await sql`update assistant_calls set duration_seconds = ${Number(params.CallDuration) || 0} where call_sid = ${params.CallSid}`;
        }
        return new Response("ok");
      },
    },
  },
});
