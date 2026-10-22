export type AccountRole = "CUSTOMER" | "OWNER" | "ADMIN";

/** Emails allowed to be operators. ADMIN_EMAIL wins; the older name is an alias. */
export function adminEmailsFromEnv(env: Record<string, string | undefined>): string[] {
  const raw = env.ADMIN_EMAIL?.trim() || env.NESTORA_ADMIN_EMAIL?.trim() || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Nobody becomes an operator just by signing up first.
 * When ADMIN_EMAIL is set, only those addresses stay operators.
 * When it is unset, existing operator rows are left alone and new accounts stay guests.
 */
export function roleAfterSignIn(input: {
  email: string;
  currentRole: AccountRole;
  ownerStatus: string;
  adminEmails: string[];
}): AccountRole {
  const email = input.email.trim().toLowerCase();
  if (input.adminEmails.length === 0) return input.currentRole;
  if (input.adminEmails.includes(email)) return "ADMIN";
  if (input.currentRole === "ADMIN") {
    return input.ownerStatus === "APPROVED" ? "OWNER" : "CUSTOMER";
  }
  if (input.currentRole === "OWNER") return "OWNER";
  return "CUSTOMER";
}
