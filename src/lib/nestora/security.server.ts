import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getRequestHeaders } from "@tanstack/react-start/server";
import QRCode from "qrcode";
import { verifyPassword } from "@better-auth/utils/password";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { adminEmailsFromEnv } from "./admin-email.ts";
import { writeAudit } from "./audit.server.ts";
import { decryptSecret, encryptSecret } from "./crypto.server.ts";
import { requireActive } from "./data.server.ts";
import { latestMailFor, sendMail } from "./mail.server.ts";
import { backupCode, randomBase32, totpUri, verifyTotp } from "./totp.server.ts";

const buckets = new Map<string, number[]>();

function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

function hashCode(code: string) {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

async function passwordMatches(userId: string, password: string) {
  const sql = await getSql();
  const rows = await sql<{ password: string | null }>`
    select password from account where "userId" = ${userId} and "providerId" = 'credential' limit 1
  `;
  const hash = rows[0]?.password;
  if (!hash) return false;
  return verifyPassword(hash, password);
}

async function sessionIdFor(userId: string) {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.session?.id || session.user.id !== userId) return null;
  return session.session.id;
}

export async function prepareSignup(input: {
  email: string;
  kind: "CUSTOMER" | "OWNER";
  payload: Record<string, unknown>;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a valid email.");
  const nonce = randomBytes(18).toString("hex");
  const sql = await getSql();
  await sql`
    insert into signup_intents (email, kind, payload, nonce)
    values (${email}, ${input.kind}, ${JSON.stringify(input.payload)}::jsonb, ${nonce})
    on conflict (email) do update set kind = excluded.kind, payload = excluded.payload, nonce = excluded.nonce, created_at = now()
  `;
  return { nonce };
}

export async function claimVerificationFallback(email: string, nonce: string) {
  const sql = await getSql();
  const rows = await sql<{ nonce: string }>`
    select nonce from signup_intents where lower(email) = lower(${email.trim()}) and created_at > now() - interval '30 minutes'
  `;
  if (!rows[0] || rows[0].nonce !== nonce) return { delivered: true, fallbackUrl: null as string | null };
  const mail = await latestMailFor(email.trim());
  const delivered = mail?.status === "SENT";
  const match = mail?.body.match(/https?:\/\/\S+/);
  return { delivered, fallbackUrl: delivered ? null : match?.[0] ?? null };
}

export async function resendVerification(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!rateLimit(`verify:${normalized}`, 3, 60 * 60 * 1000)) {
    throw new Error("Please wait before asking for another email.");
  }
  const sql = await getSql();
  const users = await sql<{ id: string; email: string; emailVerified: boolean }>`
    select id, email, "emailVerified" from "user" where lower(email) = ${normalized}
  `;
  const user = users[0];
  if (!user) throw new Error("Please verify your email.");
  if (user.emailVerified) return { alreadyVerified: true as const, delivered: true, fallbackUrl: null as string | null };
  if (!(await passwordMatches(user.id, password))) throw new Error("Those details didn't match an account.");
  await auth.api.sendVerificationEmail({
    body: { email: user.email, callbackURL: "/dashboard" },
    headers: getRequestHeaders(),
  });
  const mail = await latestMailFor(user.email);
  const delivered = mail?.status === "SENT";
  const match = mail?.body.match(/https?:\/\/\S+/);
  return { alreadyVerified: false as const, delivered, fallbackUrl: delivered ? null : match?.[0] ?? null };
}

export async function sessionSecurity(userId: string) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  const verified = await sql<{ emailVerified: boolean }>`select "emailVerified" from "user" where id = ${userId}`;
  if (!verified[0]?.emailVerified && !adminEmailsFromEnv(process.env).includes(profile.email.toLowerCase())) {
    return { ok: false as const, reason: "unverified" as const };
  }
  const sec = await sql<{ totp_enabled: boolean }>`select totp_enabled from user_security where user_id = ${userId}`;
  const settings = await sql<{ require_owner_2fa: boolean }>`select require_owner_2fa from platform_settings where id = 1`;
  const enabled = Boolean(sec[0]?.totp_enabled);
  const mustSetup = profile.role === "OWNER" && Boolean(settings[0]?.require_owner_2fa) && !enabled;
  if (mustSetup) return { ok: false as const, reason: "setup" as const };
  if (!enabled) return { ok: true as const, reason: "none" as const };
  const sid = await sessionIdFor(userId);
  if (!sid) return { ok: false as const, reason: "2fa" as const };
  const assured = await sql<{ session_id: string }>`select session_id from session_assurance where session_id = ${sid}`;
  if (!assured[0]) return { ok: false as const, reason: "2fa" as const };
  return { ok: true as const, reason: "none" as const };
}

async function assertNotLocked(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ locked_until: string | null; failed_attempts: number }>`
    select locked_until::text as locked_until, failed_attempts from user_security where user_id = ${userId}
  `;
  const row = rows[0];
  if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    throw new Error("Too many attempts. Try again in a few minutes.");
  }
}

async function recordFailure(userId: string) {
  const sql = await getSql();
  await sql`
    insert into user_security (user_id, failed_attempts)
    values (${userId}, 1)
    on conflict (user_id) do update set
      failed_attempts = user_security.failed_attempts + 1,
      locked_until = case when user_security.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else user_security.locked_until end
  `;
}

export async function beginTwoFactor(userId: string, password: string) {
  const profile = await requireActive(userId);
  if (!(await passwordMatches(userId, password))) throw new Error("That password doesn't match.");
  const secret = randomBase32();
  const sql = await getSql();
  await sql`
    insert into user_security (user_id, totp_secret_enc, totp_enabled, backup_hashes_enc, failed_attempts, locked_until)
    values (${userId}, ${encryptSecret(secret)}, false, null, 0, null)
    on conflict (user_id) do update set
      totp_secret_enc = excluded.totp_secret_enc,
      totp_enabled = false,
      backup_hashes_enc = null,
      failed_attempts = 0,
      locked_until = null
  `;
  const uri = totpUri(secret, profile.email);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { qr, secret };
}

function generateBackupCodes() {
  const plain = Array.from({ length: 10 }, () => backupCode());
  const hashes = plain.map(hashCode);
  return { plain, hashes };
}

export async function confirmTwoFactorSetup(userId: string, code: string) {
  await requireActive(userId);
  const sql = await getSql();
  const rows = await sql<{ totp_secret_enc: string | null; totp_enabled: boolean }>`
    select totp_secret_enc, totp_enabled from user_security where user_id = ${userId}
  `;
  const secret = decryptSecret(rows[0]?.totp_secret_enc);
  if (!secret) throw new Error("Start setup again.");
  if (!verifyTotp(secret, code)) throw new Error("That code didn't match. Try the next one from your app.");
  const backups = generateBackupCodes();
  await sql`
    update user_security
    set totp_enabled = true, backup_hashes_enc = ${encryptSecret(JSON.stringify(backups.hashes))}, failed_attempts = 0, locked_until = null
    where user_id = ${userId}
  `;
  const sid = await sessionIdFor(userId);
  if (sid) {
    await sql`
      insert into session_assurance (session_id, user_id) values (${sid}, ${userId})
      on conflict (session_id) do update set verified_at = now()
    `;
  }
  return { backupCodes: backups.plain };
}

export async function verifySecondFactor(userId: string, code: string) {
  await requireActive(userId);
  await assertNotLocked(userId);
  if (!rateLimit(`2fa:${userId}`, 8, 15 * 60 * 1000)) {
    throw new Error("Too many attempts. Try again in a few minutes.");
  }
  const sql = await getSql();
  const rows = await sql<{ totp_secret_enc: string | null; totp_enabled: boolean; backup_hashes_enc: string | null }>`
    select totp_secret_enc, totp_enabled, backup_hashes_enc from user_security where user_id = ${userId}
  `;
  const row = rows[0];
  if (!row?.totp_enabled) throw new Error("Two-factor authentication is not on for this account.");
  const secret = decryptSecret(row.totp_secret_enc);
  const cleaned = code.trim();
  let ok = secret ? verifyTotp(secret, cleaned) : false;
  if (!ok && row.backup_hashes_enc) {
    const hashes = JSON.parse(decryptSecret(row.backup_hashes_enc) || "[]") as string[];
    const digest = hashCode(cleaned);
    const index = hashes.findIndex((item) => {
      const left = Buffer.from(item);
      const right = Buffer.from(digest);
      return left.length === right.length && timingSafeEqual(left, right);
    });
    if (index >= 0) {
      ok = true;
      hashes.splice(index, 1);
      await sql`update user_security set backup_hashes_enc = ${encryptSecret(JSON.stringify(hashes))} where user_id = ${userId}`;
    }
  }
  if (!ok) {
    await recordFailure(userId);
    throw new Error("That code didn't match.");
  }
  await sql`update user_security set failed_attempts = 0, locked_until = null where user_id = ${userId}`;
  const sid = await sessionIdFor(userId);
  if (!sid) throw new Error("Sign in again, then enter your code.");
  await sql`
    insert into session_assurance (session_id, user_id) values (${sid}, ${userId})
    on conflict (session_id) do update set verified_at = now()
  `;
  return { ok: true as const };
}

export async function disableTwoFactor(userId: string, password: string, code: string) {
  await requireActive(userId);
  if (!(await passwordMatches(userId, password))) throw new Error("That password doesn't match.");
  await verifySecondFactor(userId, code);
  const sql = await getSql();
  await sql`
    update user_security
    set totp_enabled = false, totp_secret_enc = null, backup_hashes_enc = null, failed_attempts = 0, locked_until = null
    where user_id = ${userId}
  `;
  return { ok: true as const };
}

export async function regenerateBackupCodes(userId: string, password: string, code: string) {
  await requireActive(userId);
  if (!(await passwordMatches(userId, password))) throw new Error("That password doesn't match.");
  await verifySecondFactor(userId, code);
  const backups = generateBackupCodes();
  const sql = await getSql();
  await sql`
    update user_security set backup_hashes_enc = ${encryptSecret(JSON.stringify(backups.hashes))} where user_id = ${userId}
  `;
  return { backupCodes: backups.plain };
}

export async function securityStatus(userId: string) {
  const profile = await requireActive(userId);
  const sql = await getSql();
  const rows = await sql<{ totp_enabled: boolean }>`select totp_enabled from user_security where user_id = ${userId}`;
  const settings = await sql<{ require_owner_2fa: boolean }>`select require_owner_2fa from platform_settings where id = 1`;
  return {
    enabled: Boolean(rows[0]?.totp_enabled),
    email: profile.email,
    requireOwner2fa: Boolean(settings[0]?.require_owner_2fa),
    role: profile.role,
  };
}

export async function resetUserTwoFactor(actorId: string, userId: string) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  await sql`
    update user_security
    set totp_enabled = false, totp_secret_enc = null, backup_hashes_enc = null, failed_attempts = 0, locked_until = null
    where user_id = ${userId}
  `;
  await sql`delete from session_assurance where user_id = ${userId}`;
  await writeAudit(actor.userId, "security.reset-2fa", userId, {});
  return { ok: true as const };
}

export async function notifyPlain(to: string, template: string, subject: string, text: string) {
  await sendMail({ to, template, subject, text });
}
