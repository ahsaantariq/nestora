import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { readSeedSql } from "./seed.mjs";

test("uses bundled seed SQL when provided by the server bundle", () => {
  assert.equal(readSeedSql("bundled SQL"), "bundled SQL");
});

test("loads the seed migration relative to the script, not the working directory", () => {
  const cwd = process.cwd();
  try {
    process.chdir(tmpdir());
    assert.equal(readSeedSql(), readFileSync(new URL("../migrations/0003_seed.sql", import.meta.url), "utf8"));
  } finally {
    process.chdir(cwd);
  }
});
