import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { readSecrets } from "@/lib/nestora/assistant/settings.server";
import { handleInbound } from "@/lib/nestora/assistant/inbound.server";
import { safeEqual } from "@/lib/nestora/assistant/sign";

export const Route = createFileRoute("/api/assistant/voice-turn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = await readSecrets();
        const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!secrets.voiceBridgeSecret || !safeEqual(token, secrets.voiceBridgeSecret)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = (await request.json()) as { callSid?: string; from?: string; to?: string; text?: string; final?: boolean };
        if (!body.final) return Response.json({ say: "" });
        const from = body.from || "";
        const say = await handleInbound({
          channel: "voice",
          externalUserId: from,
          messageId: `${body.callSid || "call"}:${Date.now()}`,
          text: body.text || "",
          phone: from,
        });
        const sql = await getSql();
        if (body.callSid && body.text) {
          await sql`
            update assistant_calls
            set transcript = transcript || ${`\nGuest: ${body.text}\nNia: ${say}`},
                summary = ${say.slice(0, 240)}
            where call_sid = ${body.callSid}
          `;
        }
        const mode = await sql<{ mode: string }>`
          select c.mode from conversations c
          join contacts ct on ct.id = c.contact_id
          where ct.phone = ${from}
          order by c.last_message_at desc limit 1
        `;
        return Response.json({ say, handoff: mode[0]?.mode === "HUMAN" });
      },
    },
  },
});
