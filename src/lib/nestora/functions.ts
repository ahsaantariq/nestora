import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  return parsed.data;
}

const searchSchema = z.object({
  location: z.string().max(120).default(""),
  type: z.enum(["", "HOTEL", "HOUSE", "APARTMENT", "WAREHOUSE"]).default(""),
  minCents: z.number().int().min(0).max(50_000_000).nullable().default(null),
  maxCents: z.number().int().min(0).max(50_000_000).nullable().default(null),
  guests: z.number().int().min(0).max(100).default(0),
  bedrooms: z.number().int().min(0).max(50).default(0),
  pets: z.boolean().default(false),
  instant: z.boolean().default(false),
  minRating: z.number().int().min(0).max(5).default(0),
  amenities: z.array(z.string().max(40)).max(24).default([]),
  sort: z.enum(["newest", "price_asc", "price_desc", "rating"]).default("newest"),
});

export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { loadOrCreateProfile } = await import("./data.server.ts");
    return loadOrCreateProfile(context.userId);
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        displayName: z.string().trim().min(1, "Add your name.").max(80),
        phone: z.string().trim().max(40),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { updateOwnProfile } = await import("./data.server.ts");
    return updateOwnProfile(context.userId, data);
  });

export const requestOwner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(z.object({ note: z.string().trim().max(500) }), input),
  )
  .handler(async ({ context, data }) => {
    const { requestOwnerAccess } = await import("./data.server.ts");
    return requestOwnerAccess(context.userId, data.note);
  });

export const listFeatured = createServerFn({ method: "GET" }).handler(async () => {
  const { searchStays } = await import("./data.server.ts");
  const stays = await searchStays({
    location: "",
    type: "",
    minCents: null,
    maxCents: null,
    guests: 0,
    bedrooms: 0,
    pets: false,
    instant: false,
    minRating: 0,
    amenities: [],
    sort: "newest",
  });
  return stays.slice(0, 6);
});

export const searchCatalog = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(searchSchema, input))
  .handler(async ({ data }) => {
    const { searchStays } = await import("./data.server.ts");
    return searchStays(data);
  });

export const loadCustomerHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { customerSummary } = await import("./data.server.ts");
    return customerSummary(context.userId);
  });

export const loadMyBookings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listMyBookings } = await import("./data.server.ts");
    return listMyBookings(context.userId);
  });

export const loadSavedCards = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listSavedCards } = await import("./data.server.ts");
    return listSavedCards(context.userId);
  });

export const loadSavedStays = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listSavedStays } = await import("./data.server.ts");
    return listSavedStays(context.userId);
  });

export const loadOwnerHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ownerSummary } = await import("./data.server.ts");
    return ownerSummary(context.userId);
  });

export const loadOwnerProperties = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listOwnerProperties } = await import("./data.server.ts");
    return listOwnerProperties(context.userId);
  });

export const loadOwnerBookings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listOwnerBookings } = await import("./data.server.ts");
    return listOwnerBookings(context.userId);
  });

export const loadPayouts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { readPayoutAccount } = await import("./data.server.ts");
    return readPayoutAccount(context.userId);
  });

export const loadSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireActive, readSettings } = await import("./data.server.ts");
    await requireActive(context.userId);
    return readSettings();
  });

export const loadAdminHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { adminSummary } = await import("./data.server.ts");
    return adminSummary(context.userId);
  });

export const loadPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listPeople } = await import("./data.server.ts");
    return listPeople(context.userId);
  });

export const decideAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        userId: z.string().min(1).max(120),
        decision: z.enum(["APPROVE", "REJECT", "SUSPEND", "RESTORE"]),
        note: z.string().trim().max(500).default(""),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { decideAccount: apply } = await import("./data.server.ts");
    await apply(context.userId, data);
    return { ok: true as const };
  });

export const loadPendingListings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listPendingListings } = await import("./data.server.ts");
    return listPendingListings(context.userId);
  });

export const loadStay = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(z.object({ slug: z.string().trim().min(1).max(160) }), input))
  .handler(async ({ data }) => {
    const { getStayBySlug } = await import("./data.server.ts");
    return getStayBySlug(data.slug);
  });

export const downloadBookingsCsv = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { bookingsCsv } = await import("./data.server.ts");
    return bookingsCsv(context.userId);
  });

export const loadAdminTables = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { adminTables } = await import("./data.server.ts");
    return adminTables(context.userId);
  });


