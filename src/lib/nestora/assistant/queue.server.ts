import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { releaseHold } from "./flow.server.ts";
import { sendOnChannel } from "./channels.server.ts";
import { handleInbound } from "./inbound.server.ts";
import { readAssistantSettings, readSecrets } from "./settings.server.ts";
import { maskSensitive } from "./sign.ts";

let started = false;
let running = false;

export async function enqueueJob(kind: string, payload: Record<string, unknown>, runAt: Date, uniqueKey?: string) {
  const sql = await getSql();
  await sql`
    insert into assistant_jobs (id, kind, payload, run_at, unique_key)
    values (${randomUUID()}, ${kind}, ${JSON.stringify(payload)}::jsonb, ${runAt.toISOString()}, ${uniqueKey ?? null})
    on conflict (unique_key) do nothing
  `;
}

export function ensureQueue() {
  if (started || typeof window !== "undefined") return;
  started = true;
  setInterval(() => {
    void drainJobs().catch((error) => console.error("[assistant-queue]", maskSensitive(error instanceof Error ? error.message : "queue failed")));
  }, 20000);
  void drainJobs().catch(() => undefined);
}

export async function drainJobs() {
  if (running) return;
  running = true;
  try {
    const sql = await getSql();
    const jobs = await sql<{ id: string; kind: string; payload: unknown; attempts: number }>`
      update assistant_jobs set status = 'RUNNING', attempts = attempts + 1
      where id in (
        select id from assistant_jobs
        where status in ('QUEUED', 'FAILED') and attempts < 5 and run_at <= now()
        order by run_at asc limit 10
      )
      returning id, kind, payload, attempts
    `;
    for (const job of jobs) {
      try {
        await runJob(job.kind, (job.payload && typeof job.payload === "object" ? job.payload : {}) as Record<string, unknown>);
        await sql`update assistant_jobs set status = 'DONE', last_error = null where id = ${job.id}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Job failed";
        await sql`
          update assistant_jobs set status = 'FAILED', last_error = ${message.slice(0, 300)},
            run_at = now() + interval '2 minutes'
          where id = ${job.id}
        `;
      }
    }
    await pollImap().catch((error) => console.error("[assistant-imap]", maskSensitive(error instanceof Error ? error.message : "imap failed")));
    await retain();
  } finally {
    running = false;
  }
}

async function runJob(kind: string, payload: Record<string, unknown>) {
  if (kind === "release_hold") {
    await releaseHold(String(payload.bookingId ?? ""));
    return;
  }
  if (kind === "payment_reminder") {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      status: string;
      payment_url: string | null;
      conversation_id: string | null;
      payment_channel: string | null;
      title: string;
      reminder_sent: boolean;
    }>`
      select b.id, b.status, b.payment_url, b.conversation_id, b.payment_channel, b.reminder_sent, p.title
      from bookings b join properties p on p.id = b.property_id
      where b.id = ${String(payload.bookingId ?? "")}
    `;
    const booking = rows[0];
    if (!booking || booking.status !== "PENDING" || booking.reminder_sent || !booking.conversation_id || !booking.payment_url) return;
    await sql`update bookings set reminder_sent = true where id = ${booking.id}`;
    const contact = await sql<{ phone: string | null; email: string | null }>`
      select phone, email from contacts where id = (select contact_id from conversations where id = ${booking.conversation_id})
    `;
    await sendOnChannel({
      conversationId: booking.conversation_id,
      channel: (booking.payment_channel || "web") as "web",
      to: contact[0]?.email || contact[0]?.phone || "",
      text: `A quick note: the hold for ${booking.title} expires soon. You can still pay here if you'd like it: ${booking.payment_url}`,
      sender: "AI",
    });
  }
}

async function pollImap() {
  const secrets = await readSecrets();
  const settings = await readAssistantSettings();
  if (!settings.emailOn || !secrets.imapHost || !secrets.imapUsername || !secrets.imapPassword) return;
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: secrets.imapHost,
    port: secrets.imapPort || 993,
    secure: secrets.imapSecure,
    auth: { user: secrets.imapUsername, pass: secrets.imapPassword },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = await client.search({ seen: false });
    for (const uid of (uids || []).slice(0, 15)) {
      const message = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
      if (!message || typeof message === "boolean") continue;
      const from = message.envelope?.from?.[0];
      const email = from?.address || "";
      const name = from?.name || "";
      const subject = message.envelope?.subject || "";
      const raw = message.source ? message.source.toString("utf8") : "";
      const text = extractText(raw).slice(0, 4000) || subject;
      const messageId = message.envelope?.messageId || `imap-${uid}`;
      await handleInbound({
        channel: "email",
        externalUserId: email.toLowerCase(),
        messageId,
        text: subject ? `${subject}\n${text}` : text,
        name,
        email,
      });
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

function extractText(raw: string): string {
  const plain = raw.split("Content-Type: text/plain", 2)[1];
  const chunk = plain || raw;
  return chunk
    .replace(/Content-Transfer-Encoding:[^\n]+\n/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/=\r?\n/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

async function retain() {
  const settings = await readAssistantSettings();
  const sql = await getSql();
  await sql`
    update assistant_calls
    set recording_url = null, transcript = '', summary = ''
    where created_at < now() - (${settings.retentionDays} || ' days')::interval
      and (recording_url is not null or transcript <> '')
  `;
}
