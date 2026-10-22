#!/usr/bin/env node
/**
 * Versioned schema sync for any Postgres that speaks the wire protocol.
 * Uses DIRECT_URL when set, otherwise DATABASE_URL. Each file runs once,
 * inside a transaction, and is recorded in `_migrations`. Nothing is dropped.
 *
 * No URL (sandbox preview) -> skip. PGLite applies the same files on startup.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applySqlMigrations } from "./apply-migrations.mjs";
import { connectionAdvice, readDbUrls } from "./pg-target.mjs";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function runMigrate() {
  const { migrationUrl, directUrl } = readDbUrls();
  if (!migrationUrl) {
    console.log("[migrate] DATABASE_URL and DIRECT_URL are unset — skipping (PGLite migrates itself).");
    return 0;
  }
  if (!directUrl) {
    console.log("[migrate] DIRECT_URL is unset — using DATABASE_URL for schema sync.");
  }
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return 0;
  }
  const files = [];
  for (const name of entries) {
    if (!name.endsWith(".sql")) continue;
    files.push({ name, sql: await readFile(join(migrationsDir, name), "utf8") });
  }
  if (files.length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return 0;
  }
  return applySqlMigrations({ connectionString: migrationUrl, files });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runMigrate().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[migrate] failed:", message);
    console.error("[migrate] fix:", connectionAdvice(message, readDbUrls().migrationUrl));
    process.exit(1);
  });
}
