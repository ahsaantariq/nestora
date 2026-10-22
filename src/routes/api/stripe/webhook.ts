import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature } from "@/lib/nestora/stripe.server";
import { ingestStripeEvent } from "@/lib/nestora/commerce.server";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
        const payload = await request.text();
        if (!secret) {
          return Response.json({ error: "STRIPE_WEBHOOK_SECRET is not set." }, { status: 500 });
        }
        const valid = verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret);
        if (!valid) return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
        const event = JSON.parse(payload) as { id?: string; type?: string };
        if (!event.id || !event.type) return Response.json({ error: "Missing event id." }, { status: 400 });
        const result = await ingestStripeEvent(event.id, event.type, JSON.parse(payload));
        return Response.json(result);
      },
    },
  },
});
