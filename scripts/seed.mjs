#!/usr/bin/env node
/**
 * Idempotent seed: default fees/policies, then the operator from ADMIN_EMAIL.
 * Never creates listings. Never resets an existing password.
 * Safe to run on every boot.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "@better-auth/utils/password";
import { pgConfig, readDbUrls } from "./pg-target.mjs";

/** @param {string | undefined} bundledSeedSql */
export function readSeedSql(bundledSeedSql) {
  return bundledSeedSql ?? fs.readFileSync(new URL("../migrations/0003_seed.sql", import.meta.url), "utf8");
}

function adminEmail() {
  return (process.env.ADMIN_EMAIL || process.env.NESTORA_ADMIN_EMAIL || "").trim().toLowerCase();
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || process.env.NESTORA_ADMIN_PASSWORD || "";
}

/** @param {{ seedSql?: string }} [options] */
export async function runSeed({ seedSql: bundledSeedSql } = {}) {
  const { migrationUrl } = readDbUrls();
  if (!migrationUrl) {
    console.log(
      "[seed] No DATABASE_URL. Default settings apply with the SQL migrations. Set ADMIN_EMAIL so that address becomes the only operator when they sign in.",
    );
    return;
  }

  const seedSql = readSeedSql(bundledSeedSql);
  const pool = new pg.Pool({ ...pgConfig(migrationUrl), max: 1 });
  const client = await pool.connect();
  try {
    await client.query(seedSql);
    console.log("[seed] Default settings are in place: 10% commission on, subscription off, 15% management fee, Flexible/Moderate/Strict.");

    const email = adminEmail();
    const password = adminPassword();
    const name = (process.env.ADMIN_NAME || process.env.NESTORA_ADMIN_NAME || "Nestora operator").trim();
    if (!email) {
      console.log("[seed] ADMIN_EMAIL is unset. No operator was created. New accounts stay guests.");
      return;
    }
    const existing = await client.query(`select id from "user" where lower(email) = $1`, [email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      if (!password || password.length < 8) {
        console.log(
          `[seed] ${email} will become the operator when that person signs up. Set ADMIN_PASSWORD (8+ characters) to create the account now.`,
        );
        return;
      }
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
      console.log(`[seed] Created operator account for ${email}.`);
    } else {
      console.log(`[seed] Account already exists for ${email}. Password was left unchanged.`);
    }
    await client.query(
      `insert into profiles (user_id, display_name, role, owner_status)
       values ($1, $2, 'ADMIN', 'NONE')
       on conflict (user_id) do update set role = 'ADMIN', display_name = excluded.display_name, updated_at = now()`,
      [userId, name],
    );
    console.log(`[seed] ${email} is the operator. Other accounts are not promoted.`);
  } finally {
    client.release();
    await pool.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runSeed().catch((error) => {
    console.error("[seed] failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
