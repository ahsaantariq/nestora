import { createFileRoute } from "@tanstack/react-router";
import { databaseHealth } from "@/lib/db";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const body = await databaseHealth();
        return Response.json(body, { status: body.ok ? 200 : 503 });
      },
    },
  },
});
