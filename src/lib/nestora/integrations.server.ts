import { getSql } from "@/lib/db";
import { requireActive } from "./data.server.ts";
import { decryptSecret, encryptSecret, secretHint } from "./crypto.server.ts";
import { writeAudit } from "./audit.server.ts";
import { drainEmailQueue, resolveSmtp, sendMail, smtpConfigured } from "./mail.server.ts";

export type IntegrationView = {
  stripePublishableKey: string;
  stripeSecretHint: string | null;
  stripeWebhookHint: string | null;
  stripeLive: boolean;
  stripeConfigured: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: "TLS" | "SSL" | "NONE";
  smtpUsername: string;
  smtpPasswordHint: string | null;
  smtpFromName: string;
  smtpFromEmail: string;
  smtpConfigured: boolean;
  requireOwner2fa: boolean;
  webhookPath: string;
};

async function loadRow() {
  const sql = await getSql();
  const rows = await sql<{
    stripe_publishable_key: string | null;
    stripe_secret_enc: string | null;
    stripe_webhook_enc: string | null;
    stripe_live: boolean;
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_security: string | null;
    smtp_username: string | null;
    smtp_password_enc: string | null;
    smtp_from_name: string | null;
    smtp_from_email: string | null;
  }>`
    select stripe_publishable_key, stripe_secret_enc, stripe_webhook_enc, stripe_live,
           smtp_host, smtp_port, smtp_security, smtp_username, smtp_password_enc, smtp_from_name, smtp_from_email
    from integration_settings where id = 1
  `;
  return rows[0];
}

export async function readStripeRuntime() {
  const row = await loadRow();
  const secret = decryptSecret(row?.stripe_secret_enc) || process.env.STRIPE_SECRET_KEY?.trim() || "";
  const publishable = row?.stripe_publishable_key?.trim() || process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() || process.env.STRIPE_PUBLISHABLE_KEY?.trim() || "";
  const webhook = decryptSecret(row?.stripe_webhook_enc) || process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  return {
    secret,
    publishable,
    webhook,
    live: Boolean(row?.stripe_live),
  };
}

export async function readIntegrationView(actorId: string): Promise<IntegrationView> {
  await requireActive(actorId, ["ADMIN"]);
  const row = await loadRow();
  const stripe = await readStripeRuntime();
  const sql = await getSql();
  const settings = await sql<{ require_owner_2fa: boolean }>`select require_owner_2fa from platform_settings where id = 1`;
  const security = (row?.smtp_security || "TLS").toUpperCase();
  const smtpPassword = decryptSecret(row?.smtp_password_enc);
  return {
    stripePublishableKey: row?.stripe_publishable_key ?? "",
    stripeSecretHint: secretHint(decryptSecret(row?.stripe_secret_enc)),
    stripeWebhookHint: secretHint(decryptSecret(row?.stripe_webhook_enc)),
    stripeLive: Boolean(row?.stripe_live),
    stripeConfigured: Boolean(stripe.secret),
    smtpHost: row?.smtp_host ?? "",
    smtpPort: row?.smtp_port ? String(row.smtp_port) : "",
    smtpSecurity: security === "SSL" || security === "NONE" ? security : "TLS",
    smtpUsername: row?.smtp_username ?? "",
    smtpPasswordHint: secretHint(smtpPassword),
    smtpFromName: row?.smtp_from_name ?? "",
    smtpFromEmail: row?.smtp_from_email ?? "",
    smtpConfigured: await smtpConfigured(),
    requireOwner2fa: Boolean(settings[0]?.require_owner_2fa),
    webhookPath: "/api/stripe/webhook",
  };
}

export async function saveIntegrations(
  actorId: string,
  input: {
    stripePublishableKey: string;
    stripeSecret: string;
    stripeWebhookSecret: string;
    stripeLive: boolean;
    clearStripeSecret: boolean;
    clearStripeWebhook: boolean;
    smtpHost: string;
    smtpPort: string;
    smtpSecurity: "TLS" | "SSL" | "NONE";
    smtpUsername: string;
    smtpPassword: string;
    clearSmtpPassword: boolean;
    smtpFromName: string;
    smtpFromEmail: string;
    requireOwner2fa: boolean;
  },
) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const current = await loadRow();
  const sql = await getSql();
  const port = input.smtpPort.trim() ? Number(input.smtpPort) : null;
  if (port != null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("SMTP port must be between 1 and 65535.");
  }
  let secretEnc = current?.stripe_secret_enc ?? null;
  if (input.clearStripeSecret) secretEnc = null;
  else if (input.stripeSecret.trim()) secretEnc = encryptSecret(input.stripeSecret.trim());
  let webhookEnc = current?.stripe_webhook_enc ?? null;
  if (input.clearStripeWebhook) webhookEnc = null;
  else if (input.stripeWebhookSecret.trim()) webhookEnc = encryptSecret(input.stripeWebhookSecret.trim());
  let passwordEnc = current?.smtp_password_enc ?? null;
  if (input.clearSmtpPassword) passwordEnc = null;
  else if (input.smtpPassword.trim()) passwordEnc = encryptSecret(input.smtpPassword.trim());
  await sql`
    update integration_settings set
      stripe_publishable_key = ${input.stripePublishableKey.trim() || null},
      stripe_secret_enc = ${secretEnc},
      stripe_webhook_enc = ${webhookEnc},
      stripe_live = ${input.stripeLive},
      smtp_host = ${input.smtpHost.trim() || null},
      smtp_port = ${port},
      smtp_security = ${input.smtpSecurity},
      smtp_username = ${input.smtpUsername.trim() || null},
      smtp_password_enc = ${passwordEnc},
      smtp_from_name = ${input.smtpFromName.trim() || null},
      smtp_from_email = ${input.smtpFromEmail.trim() || null},
      updated_at = now(),
      updated_by = ${actor.userId}
    where id = 1
  `;
  await sql`update platform_settings set require_owner_2fa = ${input.requireOwner2fa}, updated_at = now() where id = 1`;
  await writeAudit(actor.userId, "integrations.update", "integration_settings", {
    stripeLive: input.stripeLive,
    stripeSecretReplaced: Boolean(input.stripeSecret.trim()) || input.clearStripeSecret,
    webhookReplaced: Boolean(input.stripeWebhookSecret.trim()) || input.clearStripeWebhook,
    smtpHost: input.smtpHost.trim(),
    smtpPasswordReplaced: Boolean(input.smtpPassword.trim()) || input.clearSmtpPassword,
    requireOwner2fa: input.requireOwner2fa,
  });
  return readIntegrationView(actorId);
}

export async function testStripe(actorId: string) {
  await requireActive(actorId, ["ADMIN"]);
  const stripe = await readStripeRuntime();
  if (!stripe.secret) throw new Error("Add a Stripe secret key first.");
  const response = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${stripe.secret}` },
  });
  const json = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message || "Stripe did not accept that key.");
  return { ok: true as const, mode: stripe.secret.startsWith("sk_live") ? "live" : "test" };
}

export async function sendTestEmail(actorId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const config = await resolveSmtp();
  if (!config) throw new Error("Add SMTP settings, or set the SMTP environment variables, before sending a test.");
  await sendMail({
    to: actor.email,
    template: "smtp-test",
    subject: "Nestora test email",
    text: "This is a test from Nestora. If you can read it, email delivery is working.",
  });
  await drainEmailQueue();
  return { ok: true as const, to: actor.email };
}
