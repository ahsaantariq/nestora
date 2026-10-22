/**
 * Nestora seed.
 *
 * Default settings and cancellation policies live in migrations/0003_seed.sql
 * and apply on their own (preview and production). This script re-applies that
 * file when DATABASE_URL is set, and creates one operator only when both
 * NESTORA_ADMIN_EMAIL and NESTORA_ADMIN_PASSWORD are set. It never invents a
 * password or a listing.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "@better-auth/utils/password";

const databaseUrl = process.env.DATABASE_URL?.trim();
const email = process.env.NESTORA_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.NESTORA_ADMIN_PASSWORD;
const name = process.env.NESTORA_ADMIN_NAME?.trim() || "Nestora operator";

if (!databaseUrl) {
  console.log(
    "No DATABASE_URL. Settings seed with the app migrations. The first signed-in account becomes the operator unless NESTORA_ADMIN_EMAILS is set.",
  );
  process.exit(0);
}

const seedSql = fs.readFileSync(
  path.join(process.cwd(), "migrations/0003_seed.sql"),
  "utf8",
);
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(seedSql);
  console.log("Default settings and cancellation policies are in place.");
  if (!email || !password) {
    console.log(
      "Skipped operator user. Set NESTORA_ADMIN_EMAIL and NESTORA_ADMIN_PASSWORD to create one.",
    );
    process.exit(0);
  }
  if (password.length < 8) {
    throw new Error("NESTORA_ADMIN_PASSWORD must be at least 8 characters.");
  }
  const existing = await client.query(`select id from "user" where lower(email) = $1`, [email]);
  let userId = existing.rows[0]?.id;
  if (!userId) {
    userId = randomUUID();
    const now = new Date();
    await client.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, $4, $4)`,
      [userId, name, email, now],
    );
    const hash = await hashPassword(password);
    await client.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $2, $3, $4, $4)`,
      [randomUUID(), userId, hash, now],
    );
    console.log(`Created operator account for ${email}.`);
  } else {
    console.log(`Account already exists for ${email}.`);
  }
  await client.query(
    `insert into profiles (user_id, display_name, role, owner_status)
     values ($1, $2, 'ADMIN', 'NONE')
     on conflict (user_id) do update set role = 'ADMIN', updated_at = now()`,
    [userId, name],
  );
  await client.query(
    `update platform_lock set founder_user_id = $1 where id = 1 and founder_user_id is null`,
    [userId],
  );
  console.log("Operator role is ADMIN.");
} finally {
  await client.end();
}
