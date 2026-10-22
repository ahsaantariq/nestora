import { createHmac, timingSafeEqual } from "node:crypto";
import { readStripeRuntime } from "./integrations.server.ts";

async function secret(): Promise<string> {
  const stripe = await readStripeRuntime();
  if (!stripe.secret) throw new Error("Card payments are not set up yet.");
  return stripe.secret;
}

export async function stripePublishableKey(): Promise<string | null> {
  const stripe = await readStripeRuntime();
  return stripe.publishable || null;
}

export async function stripeWebhookSecret(): Promise<string | null> {
  const stripe = await readStripeRuntime();
  return stripe.webhook || null;
}

export async function stripeConfigured(): Promise<boolean> {
  const stripe = await readStripeRuntime();
  return Boolean(stripe.secret);
}

export async function stripeForm(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
  idempotencyKey: string,
) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") body.append(key, String(value));
  }
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await secret()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body,
  });
  const json = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json.error?.message || "Stripe rejected that request.");
  }
  return json as Record<string, unknown>;
}

export async function stripeGet(path: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${await secret()}` },
  });
  const json = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message || "Stripe could not be reached.");
  return json as Record<string, unknown>;
}

export function verifyStripeSignature(payload: string, header: string | null, webhookSecret: string): boolean {
  if (!header) return false;
  const parts = new Map(header.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value] as const;
  }));
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60) return false;
  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${payload}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
