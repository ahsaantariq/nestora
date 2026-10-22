/**
 * Portable Postgres targets. There is no ORM datasource.
 *
 * DATABASE_URL  — runtime queries. May be a pooler (Supabase port 6543).
 * DIRECT_URL    — schema sync only. Must be a direct/session connection on port 5432.
 * On a single VPS Postgres, set both to the same URL.
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readDbUrls(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim() || "";
  const directUrl = env.DIRECT_URL?.trim() || "";
  return {
    databaseUrl,
    directUrl,
    migrationUrl: directUrl || databaseUrl,
  };
}

/**
 * @param {string} connectionString
 */
export function looksLikePooler(connectionString) {
  if (!connectionString) return false;
  if (/:6543\b|pgbouncer=true/i.test(connectionString)) return true;
  try {
    const url = new URL(connectionString);
    const port = url.port || "5432";
    const host = url.hostname.toLowerCase();
    if (port === "6543") return true;
    if (host.includes("pooler")) return true;
    if ((url.searchParams.get("pgbouncer") || "").toLowerCase() === "true") return true;
    return false;
  } catch {
    return /pooler/i.test(connectionString);
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"unset" | "direct" | "pooler" | "database-url"}
 */
export function migrationTargetKind(env = process.env) {
  const { databaseUrl, directUrl, migrationUrl } = readDbUrls(env);
  if (!migrationUrl) return "unset";
  if (looksLikePooler(migrationUrl)) return "pooler";
  if (directUrl) return "direct";
  return databaseUrl ? "database-url" : "unset";
}

/**
 * @param {string} connectionString
 */
export function pgConfig(connectionString) {
  /** @type {{ connectionString: string, ssl?: { rejectUnauthorized: boolean }, max?: number }} */
  const config = { connectionString };
  try {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase();
    const sslmode = (url.searchParams.get("sslmode") || "").toLowerCase();
    if (sslmode === "disable") return config;
    const hosted =
      host.endsWith("supabase.co") ||
      host.endsWith("supabase.com") ||
      host.includes("neon.tech") ||
      host.includes("pooler");
    if (hosted || sslmode === "require" || sslmode === "prefer" || sslmode === "no-verify") {
      config.ssl = {
        rejectUnauthorized: sslmode === "verify-full" || sslmode === "verify-ca",
      };
    }
  } catch {
    // Leave the raw string. `pg` will parse it.
  }
  return config;
}

/**
 * @param {string} message
 * @param {string} connectionString
 */
export function connectionAdvice(message, connectionString) {
  const lower = String(message || "").toLowerCase();
  const pooler = looksLikePooler(connectionString);
  if (
    pooler ||
    lower.includes("prepared statement") ||
    lower.includes("pgbouncer") ||
    lower.includes("6543")
  ) {
    return "Use the direct connection string on port 5432 for DIRECT_URL, not the pooler. DATABASE_URL can stay on the pooler for app traffic. On a VPS, set both variables to the same URL.";
  }
  if (lower.includes("password") || lower.includes("authentication") || lower.includes("28p01")) {
    return "The database rejected the username or password. Check DATABASE_URL and DIRECT_URL, then run the schema sync again.";
  }
  if (
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("no pg_hba")
  ) {
    return "Could not reach Postgres. For Supabase, DIRECT_URL must be the direct host on port 5432 (db.<project>.supabase.co), not the pooler on port 6543.";
  }
  return "Check DATABASE_URL (runtime, pooler allowed) and DIRECT_URL (schema sync on port 5432). On a VPS both can be the same URL.";
}
