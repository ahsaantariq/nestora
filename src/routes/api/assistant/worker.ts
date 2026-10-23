import { createFileRoute } from "@tanstack/react-router";
import { readSecrets } from "@/lib/nestora/assistant/settings.server";
import { drainJobs } from "@/lib/nestora/assistant/queue.server";
import { safeEqual } from "@/lib/nestora/assistant/sign";

export const Route = createFileRoute("/api/assistant/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secrets = await readSecrets();
        const header = request.headers.get("authorization") || "";
        const token = header.replace(/^Bearer\s+/i, "");
        if (!secrets.voiceBridgeSecret || !safeEqual(token, secrets.voiceBridgeSecret)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        await drainJobs();
        return Response.json({ ok: true });
      },
    },
  },
});
