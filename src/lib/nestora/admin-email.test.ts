import assert from "node:assert/strict";
import test from "node:test";
import { adminEmailsFromEnv, roleAfterSignIn } from "./admin-email.ts";

test("only ADMIN_EMAIL is an operator", () => {
  assert.deepEqual(adminEmailsFromEnv({ ADMIN_EMAIL: "Ada@Nestora.test" }), ["ada@nestora.test"]);
  assert.equal(
    roleAfterSignIn({
      email: "ada@nestora.test",
      currentRole: "CUSTOMER",
      ownerStatus: "NONE",
      adminEmails: ["ada@nestora.test"],
    }),
    "ADMIN",
  );
  assert.equal(
    roleAfterSignIn({
      email: "guest@example.com",
      currentRole: "CUSTOMER",
      ownerStatus: "NONE",
      adminEmails: ["ada@nestora.test"],
    }),
    "CUSTOMER",
  );
});

test("the first account is not promoted when no admin email is configured", () => {
  assert.equal(
    roleAfterSignIn({
      email: "first@example.com",
      currentRole: "CUSTOMER",
      ownerStatus: "NONE",
      adminEmails: [],
    }),
    "CUSTOMER",
  );
});

test("a stray operator is demoted when ADMIN_EMAIL is set to someone else", () => {
  assert.equal(
    roleAfterSignIn({
      email: "first@example.com",
      currentRole: "ADMIN",
      ownerStatus: "NONE",
      adminEmails: ["ada@nestora.test"],
    }),
    "CUSTOMER",
  );
  assert.equal(
    roleAfterSignIn({
      email: "host@example.com",
      currentRole: "ADMIN",
      ownerStatus: "APPROVED",
      adminEmails: ["ada@nestora.test"],
    }),
    "OWNER",
  );
});
