import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { getSql } from "@/lib/db";
import { decryptSecret } from "./crypto.server.ts";

type SmtpConfig = {
  host: string;
  port: number;
  security: "TLS" | "SSL" | "NONE";
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export async function resolveSmtp(): Promise<SmtpConfig | null> {
  const sql = await getSql();
  const rows = await sql<{
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_security: string | null;
    smtp_username: string | null;
    smtp_password_enc: string | null;
    smtp_from_name: string | null;
    smtp_from_email: string | null;
  }>`
    select smtp_host, smtp_port, smtp_security, smtp_username, smtp_password_enc, smtp_from_name, smtp_from_email
    from integration_settings where id = 1
  `;
  const row = rows[0];
  const host = row?.smtp_host?.trim() || process.env.SMTP_HOST?.trim() || "";
  const fromEmail = row?.smtp_from_email?.trim() || process.env.SMTP_FROM?.trim() || process.env.EMAIL_FROM?.trim() || "";
  if (!host || !fromEmail) return null;
  const security = (row?.smtp_security || process.env.SMTP_SECURITY || "TLS").toUpperCase();
  const password = decryptSecret(row?.smtp_password_enc) || process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim() || "";
  return {
    host,
    port: Number(row?.smtp_port || process.env.SMTP_PORT || (security === "SSL" ? 465 : 587)),
    security: security === "SSL" || security === "NONE" ? security : "TLS",
    username: row?.smtp_username?.trim() || process.env.SMTP_USER?.trim() || "",
    password,
    fromName: row?.smtp_from_name?.trim() || process.env.SMTP_FROM_NAME?.trim() || "Nestora",
    fromEmail,
  };
}

export async function smtpConfigured(): Promise<boolean> {
  return Boolean(await resolveSmtp());
}

async function deliver(
  config: SmtpConfig,
  input: {
    to: string;
    subject: string;
    text: string;
    attachments?: { filename: string; content: Buffer; contentType: string }[];
    headers?: Record<string, string>;
  },
) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === "SSL",
    requireTLS: config.security === "TLS",
    auth: config.username ? { user: config.username, pass: config.password } : undefined,
  });
  await transport.sendMail({
    from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
    headers: input.headers,
  });
}

export async function sendMail(input: {
  to: string;
  template: string;
  subject: string;
  text: string;
  attachments?: { filename: string; contentBase64: string; contentType: string }[];
  headers?: Record<string, string>;
}) {
  const sql = await getSql();
  const id = randomUUID();
  await sql`
    insert into email_log (id, to_address, template, subject, body, payload, status, attempts, next_attempt_at)
    values (
      ${id},
      ${input.to || "missing"},
      ${input.template},
      ${input.subject},
      ${input.text},
      ${JSON.stringify({ subject: input.subject, attachments: input.attachments ?? [], headers: input.headers ?? {} })}::jsonb,
      'QUEUED',
      0,
      now()
    )
  `;
  await drainEmailQueue();
  return id;
}

export async function drainEmailQueue() {
  const sql = await getSql();
  const config = await resolveSmtp();
  const rows = await sql<{ id: string; to_address: string; subject: string; body: string; attempts: number; payload: unknown }>`
    select id, to_address, subject, body, attempts, payload
    from email_log
    where status in ('QUEUED', 'FAILED')
      and attempts < 5
      and (next_attempt_at is null or next_attempt_at <= now())
    order by created_at asc
    limit 20
  `;
  for (const row of rows) {
    if (!config || !row.to_address || row.to_address === "missing") {
      await sql`
        update email_log
        set status = 'FAILED', attempts = attempts + 1, error = 'Email is not configured yet.',
            next_attempt_at = now() + interval '15 minutes'
        where id = ${row.id}
      `;
      continue;
    }
    try {
      const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as {
        attachments?: { filename: string; contentBase64: string; contentType: string }[];
        headers?: Record<string, string>;
      };
      await deliver(config, {
        to: row.to_address,
        subject: row.subject || "Nestora",
        text: row.body || "",
        headers: payload.headers,
        attachments: (payload.attachments ?? []).map((file) => ({
          filename: file.filename,
          content: Buffer.from(file.contentBase64, "base64"),
          contentType: file.contentType,
        })),
      });
      await sql`
        update email_log
        set status = 'SENT', attempts = attempts + 1, error = null, sent_at = now()
        where id = ${row.id}
      `;
    } catch (error) {
      const attempts = row.attempts + 1;
      const wait = RETRY_MS[Math.min(attempts - 1, RETRY_MS.length - 1)] ?? RETRY_MS[RETRY_MS.length - 1]!;
      const waitSeconds = Math.round(wait / 1000);
      const message = error instanceof Error ? error.message : "Email failed";
      await sql`
        update email_log
        set status = 'FAILED', attempts = ${attempts}, error = ${message.slice(0, 500)},
            next_attempt_at = now() + make_interval(secs => ${waitSeconds})
        where id = ${row.id}
      `;
    }
  }
}

export async function latestMailFor(to: string) {
  const sql = await getSql();
  const rows = await sql<{ status: string; body: string; error: string | null }>`
    select status, body, error from email_log
    where lower(to_address) = lower(${to})
    order by created_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

export async function listEmailLog(limit = 100) {
  const sql = await getSql();
  return sql<{
    id: string;
    to_address: string;
    template: string;
    subject: string;
    status: string;
    attempts: number;
    error: string | null;
    created_at: string;
  }>`
    select id, to_address, template, subject, status, attempts, error, created_at::text as created_at
    from email_log
    order by created_at desc
    limit ${limit}
  `;
}

export async function notifyUser(input: {
  userId: string;
  email?: string | null;
  title: string;
  body: string;
  href?: string;
  template: string;
  emailOn: boolean;
}) {
  const sql = await getSql();
  await sql`
    insert into notifications (id, user_id, title, body, href)
    values (${randomUUID()}, ${input.userId}, ${input.title}, ${input.body}, ${input.href ?? null})
  `;
  if (input.emailOn && input.email) {
    await sendMail({
      to: input.email,
      template: input.template,
      subject: input.title,
      text: input.body,
    });
  }
}
