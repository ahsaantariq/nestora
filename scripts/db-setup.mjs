#!/usr/bin/env node
/**
 * One command: sync versioned SQL, then seed settings and the ADMIN_EMAIL operator.
 * Idempotent. Never drops tables or rows.
 *
 *   node scripts/db-setup.mjs          fail if the database rejects the connection
 *   node scripts/db-setup.mjs --soft   log and exit 0 (used by postinstall)
 */
import { fileURLToPath } from "node:url";
import { connectionAdvice, readDbUrls } from "./pg-target.mjs";
import { runMigrate } from "./migrate.mjs";
import { runSeed } from "./seed.mjs";

const soft = process.argv.includes("--soft");

export async function runSetup() {
  await runMigrate();
  await runSeed();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runSetup().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[db:setup] failed:", message);
    console.error("[db:setup] fix:", connectionAdvice(message, readDbUrls().migrationUrl));
    if (soft) {
      console.error("[db:setup] --soft: continuing without a schema sync. The server will retry on startup.");
      process.exit(0);
    }
    process.exit(1);
  });
}
