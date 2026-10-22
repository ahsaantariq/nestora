import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";
import { pgConfig } from "./pg-target.mjs";

/**
 * Apply ordered SQL files once each. Safe to re-run: applied names live in
 * `_migrations` and are never executed again. Statements are not dropped.
 *
 * @param {{ connectionString: string, files: { name: string, sql: string }[] }} input
 */
export async function applySqlMigrations(input) {
  const pool = new pg.Pool({ ...pgConfig(input.connectionString), max: 1 });
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = (await client.query("SELECT name FROM _migrations")).rows.map((row) => row.name);
    const byName = new Map(input.files.map((file) => [file.name, file.sql]));
    const pending = pendingMigrations(
      input.files.map((file) => file.name),
      applied,
    );
    let count = 0;
    for (const file of pending) {
      const sql = byName.get(file.name);
      if (!sql) continue;
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file.name]);
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Keep the original error when the session is already dead.
        }
        const wrapped = error instanceof Error ? error : new Error(String(error));
        wrapped.message = `${file.name}: ${wrapped.message}`;
        throw wrapped;
      }
      console.log(`[migrate] applied ${file.name}`);
      count += 1;
    }
    if (count === 0) console.log("[migrate] up to date.");
    else console.log(`[migrate] done — ${count} migration(s) applied.`);
    return count;
  } finally {
    client.release();
    await pool.end();
  }
}
