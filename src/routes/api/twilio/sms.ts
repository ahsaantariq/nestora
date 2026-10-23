import { createFileRoute } from "@tanstack/react-router";
import { verifyTwilioSignature } from "@/lib/nestora/assistant/sign";
import { readSecrets } from "@/lib/nestora/assistant/settings.server";
import { handleInbound } from "@/lib/nestora/assistant/inbound.server";

async function inbound(request: Request, channel: "sms" | "whatsapp") {
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
    channel,
    externalUserId: from,
    messageId: params.MessageSid || params.SmsSid || `${channel}-${Date.now()}`,
    text: params.Body || "",
    phone: from,
    name: params.ProfileName,
  });
  return new Response("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}

export const Route = createFileRoute("/api/twilio/sms")({
  server: { handlers: { POST: async ({ request }) => inbound(request, "sms") } },
});
