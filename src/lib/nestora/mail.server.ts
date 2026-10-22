import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";

export async function sendMail(input: {
  to: string;
  template: string;
  subject: string;
  text: string;
}) {
  const sql = await getSql();
  const id = randomUUID();
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from || !input.to) {
    await sql`
      insert into email_log (id, to_address, template, payload, status, error)
      values (${id}, ${input.to || "missing"}, ${input.template}, ${JSON.stringify({ subject: input.subject })}::jsonb, 'SKIPPED', 'RESEND_API_KEY or EMAIL_FROM is not set')
    `;
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      await sql`
        insert into email_log (id, to_address, template, payload, status, error)
        values (${id}, ${input.to}, ${input.template}, ${JSON.stringify({ subject: input.subject })}::jsonb, 'FAILED', ${detail.slice(0, 500)})
      `;
      return;
    }
    await sql`
      insert into email_log (id, to_address, template, payload, status)
      values (${id}, ${input.to}, ${input.template}, ${JSON.stringify({ subject: input.subject })}::jsonb, 'SENT')
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email failed";
    await sql`
      insert into email_log (id, to_address, template, payload, status, error)
      values (${id}, ${input.to}, ${input.template}, ${JSON.stringify({ subject: input.subject })}::jsonb, 'FAILED', ${message})
    `;
  }
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
