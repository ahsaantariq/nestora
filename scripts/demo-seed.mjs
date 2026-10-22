#!/usr/bin/env node
/**
 * Optional sample stays. Not part of db:setup, postinstall, or server start.
 * Re-running inserts nothing new (fixed ids). These rows are labeled Sample.
 *
 *   npm run db:demo
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "@better-auth/utils/password";
import { pgConfig, readDbUrls } from "./pg-target.mjs";
import { runMigrate } from "./migrate.mjs";

const ownerEmail = "sample-host@nestora.invalid";
const propertyId = "sample-house-lisbon";

async function main() {
  const { migrationUrl } = readDbUrls();
  if (!migrationUrl) {
    throw new Error("Set DATABASE_URL or DIRECT_URL before loading sample data. This command does nothing in the empty preview database.");
  }
  await runMigrate();
  const pool = new pg.Pool({ ...pgConfig(migrationUrl), max: 1 });
  const client = await pool.connect();
  try {
    const existingUser = await client.query(`select id from "user" where lower(email) = $1`, [ownerEmail]);
    let userId = existingUser.rows[0]?.id;
    if (!userId) {
      userId = randomUUID();
      const now = new Date();
      await client.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, true, $4, $4)`,
        [userId, "Sample host", ownerEmail, now],
      );
      const hash = await hashPassword("sample-host-password");
      await client.query(
        `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1, $2, 'credential', $2, $3, $4, $4)`,
        [randomUUID(), userId, hash, now],
      );
    }
    await client.query(
      `insert into profiles (user_id, display_name, role, owner_status)
       values ($1, 'Sample host', 'OWNER', 'APPROVED')
       on conflict (user_id) do update set role = 'OWNER', owner_status = 'APPROVED', updated_at = now()`,
      [userId],
    );
    await client.query(
      `insert into properties (
         id, owner_user_id, property_type, title, slug, summary, description, status,
         address_line, city, region, country, lat, lng, max_guests, bedrooms, beds, bathrooms,
         nightly_cents, cleaning_fee_cents, amenities, instant_book, pets_allowed
       ) values (
         $1, $2, 'HOUSE', 'Sample: Alfama house', 'sample-alfama-house',
         'Sample listing created by npm run db:demo. Not a real stay.',
         'This row exists only because someone ran the optional demo seed. Delete it from the host desk when you are done.',
         'LIVE', 'Rua do demo', 'Lisbon', 'Lisbon', 'Portugal', 38.712, -9.13,
         4, 2, 2, 1, 18000, 4500, ARRAY['Wifi','Kitchen']::text[], false, false
       )
       on conflict (id) do nothing`,
      [propertyId, userId],
    );
    console.log("[demo] Sample host and one live sample house are in the database. They are not created by a normal setup.");
    console.log(`[demo] Sign-in for the sample host is ${ownerEmail} / sample-host-password`);
  } finally {
    client.release();
    await pool.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error) => {
    console.error("[demo] failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
