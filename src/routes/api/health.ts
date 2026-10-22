import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { databaseHealth } from "@/lib/db";
import { requireActive } from "@/lib/nestora/data.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id) return new Response("Not found", { status: 404 });
        try {
          await requireActive(session.user.id, ["ADMIN"]);
        } catch {
          return new Response("Not found", { status: 404 });
        }
        const body = await databaseHealth();
        return Response.json(body, { status: body.ok ? 200 : 503 });
      },
    },
  },
});
