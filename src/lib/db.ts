import { pendingMigrations } from "../../scripts/migration-plan.mjs";

/** Which database backend is active. */
export type DbSource = "neon" | "pglite";

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const rawDatabaseUrl =
  typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl =
  rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

/**
 * Active backend: any standard Postgres when `DATABASE_URL` is set (Supabase,
 * Neon, or a VPS — the driver is node-postgres, not a hosted SDK). Otherwise a
 * local embedded **PGLite** so the preview still has a database. Schema sync
 * uses `DIRECT_URL` (port 5432) when that is set, and falls back to
 * `DATABASE_URL`.
 */
export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

/**
 * Minimal shared SQL surface, satisfied by both Neon and PGLite. Both the
 * tagged-template and `.query()` forms resolve to an array of row objects:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getSql()`). A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
  __pgMigratePromise__?: Promise<void>;
  __pgBootstrapIssue__?: { message: string; hint: string } | null;
  __pgBootstrapRetryAt__?: number;
};

/**
 * Result-type parity: Postgres sends every value as text plus a type OID — the
 * JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
 * int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
 * JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
 * production return identical, JSON-safe shapes:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string on both (arbitrary precision).
 */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  sql.transaction = async () => {
    throw new Error("This connection cannot open a transaction.");
  };
  return sql;
}

function createNeonSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    // Regular Postgres driver: node-postgres (`pg`) — works directly with Neon's
    // pooled endpoint. One pool per process; warm serverless instances reuse it.
    const { Pool, types } = await import("pg");
    const { pgConfig } = await import("../../scripts/pg-target.mjs");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({ ...pgConfig(databaseUrl!), max: 10 });
    const sql = toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
    sql.transaction = async <T>(fn: (tx: Sql) => Promise<T>) => {
      const client = await pool.connect();
      const tx = toSql(async <R>(text: string, params: unknown[]) => {
        const res = await client.query(text, params);
        return res.rows as R[];
      });
      try {
        await client.query("BEGIN");
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original error is the one that matters.
        }
        throw error;
      } finally {
        client.release();
      }
    };
    return sql;
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  // Embedded Postgres, imported on demand so it never loads on the Neon path.
  // One in-memory instance per process, shared across HMR module instances, so
  // data survives source edits (it resets on dev-server restart).
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;

  // Apply migrations/ (the single schema source) so preview matches production.
  // SQL is inlined by the bundler via import.meta.glob (no runtime fs); applied
  // files are tracked in _migrations. The glob does not descend, so the opt-in
  // auth schema under migrations/auth/ stays out. Runs once per module instance
  // — so an HMR reload after adding a migration file applies it live — with
  // passes serialized on a global chain so concurrent callers never
  // double-apply.
  const migrate = async (): Promise<void> => {
    const migrations = import.meta.glob("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const doneRows = await pg.query<{ name: string }>(
      "select name from _migrations",
    );
    const done = doneRows.rows.map((r) => r.name);
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      // Apply + record atomically (parity with scripts/migrate.mjs) so a failed
      // statement can't leave a file half-applied but untracked.
      await pg.transaction(async (tx) => {
        await tx.exec(migrations[path]);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined) // an earlier failed pass must not wedge the chain
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  const sql = toSql(async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  });
  sql.transaction = async <T>(fn: (tx: Sql) => Promise<T>) =>
    pg.transaction(async (tx) => {
      const scoped = toSql(async <R>(text: string, params: unknown[]) => {
        const result = await tx.query<R>(text, params);
        return result.rows;
      });
      return fn(scoped);
    });
  return sql;
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  if (dbSource === "neon") {
    await ensurePostgresReady();
    return createNeonSql();
  }
  return createPgliteSql();
}

/**
 * Get the shared, **server-only** SQL client. Neon when `DATABASE_URL` is set,
 * otherwise the local PGLite fallback. Memoized — safe to call per request.
 *
 * Schema comes from `migrations/*.sql`, auto-applied before the first query on
 * both backends — define tables there, never inline in server functions.
 */
export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null; // don't memoize failures — let the next call retry
    throw err;
  });
  return sqlPromise;
}

/**
 * The shared PGLite instance (preview only), with `migrations/*.sql` applied.
 * Lets Better Auth persist to the SAME embedded DB as app data in preview (via a
 * Kysely dialect). Throws when `DATABASE_URL` is set (that path uses Neon).
 */
export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

/**
 * Finish DB bootstrap before the server handles traffic.
 *
 * - **PGLite** (no `DATABASE_URL`): open the embedded DB and apply `migrations/*.sql`.
 * - **Postgres**: apply the same files with `DIRECT_URL` (or `DATABASE_URL` if
 *   that is all that is set), then seed settings and the ADMIN_EMAIL operator.
 *   A failed connection is remembered for `/api/health` and does not crash the process.
 */
export function ensureDbReady(): Promise<void> {
  const ready = dbSource === "pglite" ? getSql().then(() => undefined) : ensurePostgresReady();
  void ready.then(() => import("./nestora/assistant/queue.server.ts").then((mod) => mod.ensureQueue()).catch(() => undefined));
  return ready;
}

function bundledMigrationFiles(): { name: string; sql: string }[] {
  const migrations = import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  return Object.entries(migrations).map(([path, sql]) => ({
    name: path.split("/").pop() ?? path,
    sql,
  }));
}

async function ensurePostgresReady(): Promise<void> {
  if (globalRef.__pgMigratePromise__) return globalRef.__pgMigratePromise__;
  if (globalRef.__pgBootstrapIssue__ && Date.now() < (globalRef.__pgBootstrapRetryAt__ ?? 0)) {
    return;
  }
  const run = (async () => {
    const { connectionAdvice, readDbUrls } = await import("../../scripts/pg-target.mjs");
    const { migrationUrl } = readDbUrls();
    if (!migrationUrl) return;
    try {
      const migrations = bundledMigrationFiles();
      const { applySqlMigrations } = await import("../../scripts/apply-migrations.mjs");
      await applySqlMigrations({ connectionString: migrationUrl, files: migrations });
      const { runSeed } = await import("../../scripts/seed.mjs");
      const seedMigration = migrations.find((file) => file.name === "0003_seed.sql");
      if (!seedMigration) {
        throw new Error("Bundled migration 0003_seed.sql is missing.");
      }
      await runSeed({ seedSql: seedMigration.sql });
      globalRef.__pgBootstrapIssue__ = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      globalRef.__pgBootstrapIssue__ = { message, hint: connectionAdvice(message, migrationUrl) };
      globalRef.__pgBootstrapRetryAt__ = Date.now() + 15_000;
      globalRef.__pgMigratePromise__ = undefined;
      console.error("[db] Postgres schema sync failed:", message);
      console.error("[db]", globalRef.__pgBootstrapIssue__.hint);
    }
  })();
  globalRef.__pgMigratePromise__ = run;
  await run;
}

export type DatabaseHealth = {
  ok: boolean;
  databaseConnected: boolean;
  driver: "postgres" | "pglite";
  tables: number | null;
  migrationTarget: "unset" | "direct" | "pooler" | "database-url";
  error: string | null;
  fix: string | null;
};

/** Live connection check for `/api/health`. Does not print secrets. */
export async function databaseHealth(): Promise<DatabaseHealth> {
  const { connectionAdvice, migrationTargetKind, readDbUrls } = await import("../../scripts/pg-target.mjs");
  const kind = migrationTargetKind();
  const driver = dbSource === "pglite" ? "pglite" : "postgres";
  try {
    await ensureDbReady();
    const sql = await getSql();
    const rows = await sql<{ tables: number }>`
      select count(*)::int as tables
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `;
    const tables = rows[0]?.tables ?? 0;
    const issue = globalRef.__pgBootstrapIssue__ ?? null;
    const poolerWarning =
      kind === "pooler"
        ? "Schema sync is using a pooler URL. Set DIRECT_URL to the direct connection string on port 5432, not the pooler."
        : null;
    return {
      ok: !issue && tables > 0,
      databaseConnected: true,
      driver,
      tables,
      migrationTarget: driver === "pglite" ? "unset" : kind,
      error: issue?.message ?? null,
      fix: issue?.hint ?? poolerWarning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const urls = readDbUrls();
    return {
      ok: false,
      databaseConnected: false,
      driver,
      tables: null,
      migrationTarget: driver === "pglite" ? "unset" : kind,
      error: message,
      fix: connectionAdvice(message, urls.migrationUrl || urls.databaseUrl),
    };
  }
}

// Server-only eager start. Postgres schema sync and the PGLite fallback both
// run here so tables exist before the first request. Client bundles never hit
// this path.
const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (typeof window === "undefined") {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] bootstrap failed:", err);
    if (dbSource === "pglite") throw err;
  });
}
