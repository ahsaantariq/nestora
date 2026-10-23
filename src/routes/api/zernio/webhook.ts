import { createFileRoute } from "@tanstack/react-router";
import { verifyZernioSignature } from "@/lib/nestora/assistant/sign";
import { readAssistantSettings, readSecrets } from "@/lib/nestora/assistant/settings.server";
import { handleInbound } from "@/lib/nestora/assistant/inbound.server";
import type { ChannelName } from "@/lib/nestora/assistant/settings.server";

export const Route = createFileRoute("/api/zernio/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = await readSecrets();
        const raw = await request.text();
        const signature = request.headers.get("x-zernio-signature") || request.headers.get("x-late-signature");
        if (!verifyZernioSignature(raw, signature, secrets.zernioWebhookSecret)) {
          return Response.json({ error: "Invalid signature." }, { status: 401 });
        }
        const eventId = request.headers.get("x-zernio-event-id") || "";
        const body = JSON.parse(raw) as {
          id?: string;
          event?: string;
          message?: {
            id?: string;
            conversationId?: string;
            platform?: string;
            text?: string | null;
            sender?: { phone?: string | null; email?: string | null; name?: string; socialIds?: { facebook?: string; instagram?: string } };
          };
          account?: { accountId?: string };
        };
        const event = body.event || "";
        const settings = await readAssistantSettings();
        if (event.startsWith("comment.") && !settings.commentsOn) return Response.json({ ok: true, ignored: true });
        if (event !== "message.received") return Response.json({ ok: true });
        const platform = body.message?.platform;
        const channel: ChannelName | null = platform === "facebook" ? "messenger" : platform === "instagram" ? "instagram" : null;
        if (!channel) return Response.json({ ok: true, ignored: true });
        const sender = body.message?.sender;
        const social = sender?.socialIds?.[channel === "messenger" ? "facebook" : "instagram"] || body.message?.id || "";
        await handleInbound({
          channel,
          externalUserId: social,
          messageId: eventId || body.id || body.message?.id || "",
          text: body.message?.text || "",
          name: sender?.name,
          phone: sender?.phone || undefined,
          email: sender?.email || undefined,
          externalConversationId: body.message?.conversationId,
          accountId: body.account?.accountId,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
