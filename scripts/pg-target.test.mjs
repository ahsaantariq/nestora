import assert from "node:assert/strict";
import test from "node:test";
import { connectionAdvice, looksLikePooler, migrationTargetKind, readDbUrls } from "./pg-target.mjs";

test("direct url is preferred for migrations", () => {
  const urls = readDbUrls({
    DATABASE_URL: "postgresql://u:p@pooler.supabase.com:6543/postgres",
    DIRECT_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres",
  });
  assert.equal(urls.migrationUrl, "postgresql://u:p@db.abc.supabase.co:5432/postgres");
  assert.equal(
    migrationTargetKind({
      DATABASE_URL: "postgresql://u:p@pooler.supabase.com:6543/postgres",
      DIRECT_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres",
    }),
    "direct",
  );
});

test("pooler urls are recognized", () => {
  assert.equal(looksLikePooler("postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/postgres"), true);
  assert.equal(looksLikePooler("postgresql://u:p@db.abc.supabase.co:5432/postgres"), false);
  assert.equal(looksLikePooler("postgresql://nestora:p@10.0.0.5:5432/nestora"), false);
});

test("a pooler failure tells you to use port 5432", () => {
  const hint = connectionAdvice(
    "prepared statement already exists",
    "postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/postgres",
  );
  assert.match(hint, /port 5432/);
  assert.match(hint, /not the pooler/);
});
