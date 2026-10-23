import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { requireActive } from "@/lib/nestora/data.server";
import { subscribeInbox } from "@/lib/nestora/assistant/inbox.server";

export const Route = createFileRoute("/api/assistant/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id) return new Response("Sign in", { status: 401 });
        await requireActive(session.user.id, ["ADMIN"]);
        const encoder = new TextEncoder();
        let unsubscribe = () => {};
        const stream = new ReadableStream({
          start(controller) {
            const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            send(JSON.stringify({ type: "ready" }));
            unsubscribe = subscribeInbox(send);
            const ping = setInterval(() => {
              try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ }
            }, 15000);
            request.signal.addEventListener("abort", () => {
              clearInterval(ping);
              unsubscribe();
              try { controller.close(); } catch { /* closed */ }
            });
          },
          cancel() { unsubscribe(); },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      },
    },
  },
});
