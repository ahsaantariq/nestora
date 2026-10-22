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

export const publicFeesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readSettings } = await import("./data.server.ts");
  return readSettings();
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
    const { publicStay } = await import("./commerce.server.ts");
    return publicStay(data.slug);
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

export const loadHealth = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { databaseHealth } = await import("@/lib/db");
    return databaseHealth();
  });

export const loadDestinations = createServerFn({ method: "GET" }).handler(async () => {
  const { listDestinations } = await import("./listings.server.ts");
  return listDestinations();
});

export const createListingFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ propertyType: z.enum(["HOTEL", "HOUSE", "APARTMENT", "WAREHOUSE"]) }), input))
  .handler(async ({ context, data }) => {
    const { createListing } = await import("./listings.server.ts");
    return createListing(context.userId, data.propertyType);
  });

export const loadListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1).max(80) }), input))
  .handler(async ({ context, data }) => {
    const { loadOwnListing } = await import("./listings.server.ts");
    return loadOwnListing(context.userId, data.id);
  });

export const saveListingFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ context, data }) => {
    const { saveListingDraft } = await import("./listings.server.ts");
    return saveListingDraft(context.userId, data);
  });

export const submitListingFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1).max(80) }), input))
  .handler(async ({ context, data }) => {
    const { submitListing } = await import("./listings.server.ts");
    return submitListing(context.userId, data.id);
  });

export const addMediaFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(z.object({ id: z.string().min(1), url: z.string().url(), kind: z.enum(["IMAGE", "VIDEO"]) }), input),
  )
  .handler(async ({ context, data }) => {
    const { addMediaUrl } = await import("./listings.server.ts");
    return addMediaUrl(context.userId, data.id, data.url, data.kind);
  });

export const orderMediaFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(z.object({ id: z.string().min(1), ids: z.array(z.string()).max(40), coverId: z.string().nullable() }), input),
  )
  .handler(async ({ context, data }) => {
    const { saveMediaOrder } = await import("./listings.server.ts");
    return saveMediaOrder(context.userId, data.id, data.ids, data.coverId);
  });

export const removeMediaFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1), mediaId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { removeMedia } = await import("./listings.server.ts");
    return removeMedia(context.userId, data.id, data.mediaId);
  });

export const loadCalendar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ propertyId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) }), input))
  .handler(async ({ context, data }) => {
    const { loadOwnerCalendar } = await import("./listings.server.ts");
    return loadOwnerCalendar(context.userId, data.propertyId, data.month);
  });

export const saveCalendarDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        propertyId: z.string().min(1),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        blocked: z.boolean(),
        priceCents: z.number().int().min(0).nullable(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { setCalendarDay } = await import("./listings.server.ts");
    return setCalendarDay(context.userId, data);
  });

const tripSchema = z.object({
  slug: z.string().min(1).max(160),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(16),
  children: z.number().int().min(0).max(16),
  infants: z.number().int().min(0).max(16),
  petCount: z.number().int().min(0).max(10),
  promoCode: z.string().trim().max(40).optional(),
});

export const quoteTrip = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(tripSchema, input))
  .handler(async ({ data }) => {
    const { quoteStay } = await import("./commerce.server.ts");
    return quoteStay(data);
  });

export const holdTrip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(tripSchema.extend({ requests: z.string().max(1000).default("") }), input))
  .handler(async ({ context, data }) => {
    const { createHold } = await import("./commerce.server.ts");
    return createHold(context.userId, data);
  });

export const loadCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ bookingId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { readCheckout } = await import("./commerce.server.ts");
    return readCheckout(context.userId, data.bookingId);
  });

export const payCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ bookingId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { beginCardPayment } = await import("./commerce.server.ts");
    return beginCardPayment(context.userId, data.bookingId);
  });

export const syncCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ bookingId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { syncPayment } = await import("./commerce.server.ts");
    return syncPayment(context.userId, data.bookingId);
  });

export const previewCancel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ bookingId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { previewCancellation } = await import("./commerce.server.ts");
    return previewCancellation(context.userId, data.bookingId);
  });

export const cancelTrip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ bookingId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { cancelBooking } = await import("./commerce.server.ts");
    return cancelBooking(context.userId, data.bookingId);
  });

export const retryRefundFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ bookingId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { retryRefund } = await import("./commerce.server.ts");
    return retryRefund(context.userId, data.bookingId);
  });

export const toggleSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ propertyId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { toggleSaved } = await import("./commerce.server.ts");
    return toggleSaved(context.userId, data.propertyId);
  });

export const loadNotes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listNotifications } = await import("./commerce.server.ts");
    return listNotifications(context.userId);
  });

export const readNotes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { markNotificationsRead } = await import("./commerce.server.ts");
    return markNotificationsRead(context.userId);
  });

export const rememberSearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ label: z.string().trim().min(1).max(80), query: z.record(z.string(), z.unknown()) }), input))
  .handler(async ({ context, data }) => {
    const { saveSearch } = await import("./commerce.server.ts");
    return saveSearch(context.userId, data.label, data.query);
  });

export const publishReview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ bookingId: z.string().min(1), rating: z.number().int().min(1).max(5), body: z.string().trim().min(1).max(2000) }), input))
  .handler(async ({ context, data }) => {
    const { writeReview } = await import("./commerce.server.ts");
    return writeReview(context.userId, data);
  });

export const ownerMonths = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ownerSeries } = await import("./commerce.server.ts");
    return ownerSeries(context.userId);
  });

export const saveFees = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        subscriptionEnabled: z.boolean(),
        subscriptionAmountCents: z.number().int().min(0),
        commissionEnabled: z.boolean(),
        commissionBps: z.number().int().min(0).max(10000),
        managedManagementBps: z.number().int().min(0).max(10000),
        taxBps: z.number().int().min(0).max(10000),
        serviceFeeBps: z.number().int().min(0).max(10000),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { savePlatformSettings } = await import("./commerce.server.ts");
    return savePlatformSettings(context.userId, data);
  });

export const reviewListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(z.object({ propertyId: z.string().min(1), decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().max(500).default("") }), input),
  )
  .handler(async ({ context, data }) => {
    const { decideListing } = await import("./commerce.server.ts");
    return decideListing(context.userId, data);
  });

export const payHost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ payoutId: z.string().min(1), bankReference: z.string().trim().min(1).max(80) }), input))
  .handler(async ({ context, data }) => {
    const { markPayoutPaid } = await import("./commerce.server.ts");
    return markPayoutPaid(context.userId, data.payoutId, data.bankReference);
  });

export const verifyPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ userId: z.string().min(1), verified: z.boolean() }), input))
  .handler(async ({ context, data }) => {
    const { setVerified } = await import("./commerce.server.ts");
    return setVerified(context.userId, data.userId, data.verified);
  });

export const loadAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listAudit } = await import("./commerce.server.ts");
    return listAudit(context.userId);
  });

export const loadReviewListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { loadOwnListing } = await import("./listings.server.ts");
    return loadOwnListing(context.userId, data.id);
  });

export const prepareSignupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parseInput(
      z.object({
        email: z.string().email(),
        kind: z.enum(["CUSTOMER", "OWNER"]),
        payload: z.record(z.string(), z.unknown()).default({}),
      }),
      input,
    ),
  )
  .handler(async ({ data }) => {
    const { prepareSignup } = await import("./security.server.ts");
    return prepareSignup(data);
  });

export const claimVerificationFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(z.object({ email: z.string().email(), nonce: z.string().min(8) }), input))
  .handler(async ({ data }) => {
    const { claimVerificationFallback } = await import("./security.server.ts");
    return claimVerificationFallback(data.email, data.nonce);
  });

export const resendVerificationFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(z.object({ email: z.string().email(), password: z.string().min(8).max(200) }), input))
  .handler(async ({ data }) => {
    const { resendVerification } = await import("./security.server.ts");
    return resendVerification(data.email, data.password);
  });

export const sessionSecurityFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sessionSecurity } = await import("./security.server.ts");
    return sessionSecurity(context.userId);
  });

export const securityStatusFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { securityStatus } = await import("./security.server.ts");
    return securityStatus(context.userId);
  });

export const beginTwoFactorFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ password: z.string().min(8).max(200) }), input))
  .handler(async ({ context, data }) => {
    const { beginTwoFactor } = await import("./security.server.ts");
    return beginTwoFactor(context.userId, data.password);
  });

export const confirmTwoFactorFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ code: z.string().min(6).max(12) }), input))
  .handler(async ({ context, data }) => {
    const { confirmTwoFactorSetup } = await import("./security.server.ts");
    return confirmTwoFactorSetup(context.userId, data.code);
  });

export const verifySecondFactorFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ code: z.string().min(4).max(20) }), input))
  .handler(async ({ context, data }) => {
    const { verifySecondFactor } = await import("./security.server.ts");
    return verifySecondFactor(context.userId, data.code);
  });

export const disableTwoFactorFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ password: z.string().min(8), code: z.string().min(4).max(20) }), input))
  .handler(async ({ context, data }) => {
    const { disableTwoFactor } = await import("./security.server.ts");
    return disableTwoFactor(context.userId, data.password, data.code);
  });

export const regenerateBackupFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ password: z.string().min(8), code: z.string().min(4).max(20) }), input))
  .handler(async ({ context, data }) => {
    const { regenerateBackupCodes } = await import("./security.server.ts");
    return regenerateBackupCodes(context.userId, data.password, data.code);
  });

export const resetTwoFactorFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ userId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { resetUserTwoFactor } = await import("./security.server.ts");
    return resetUserTwoFactor(context.userId, data.userId);
  });

export const loadIntegrationsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { readIntegrationView } = await import("./integrations.server.ts");
    return readIntegrationView(context.userId);
  });

export const saveIntegrationsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        stripePublishableKey: z.string().max(200).default(""),
        stripeSecret: z.string().max(200).default(""),
        stripeWebhookSecret: z.string().max(200).default(""),
        stripeLive: z.boolean(),
        clearStripeSecret: z.boolean().default(false),
        clearStripeWebhook: z.boolean().default(false),
        smtpHost: z.string().max(200).default(""),
        smtpPort: z.string().max(6).default(""),
        smtpSecurity: z.enum(["TLS", "SSL", "NONE"]),
        smtpUsername: z.string().max(200).default(""),
        smtpPassword: z.string().max(200).default(""),
        clearSmtpPassword: z.boolean().default(false),
        smtpFromName: z.string().max(120).default(""),
        smtpFromEmail: z.string().max(200).default(""),
        requireOwner2fa: z.boolean(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { saveIntegrations } = await import("./integrations.server.ts");
    return saveIntegrations(context.userId, data);
  });

export const testStripeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { testStripe } = await import("./integrations.server.ts");
    return testStripe(context.userId);
  });

export const sendTestEmailFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sendTestEmail } = await import("./integrations.server.ts");
    return sendTestEmail(context.userId);
  });

export const loadEmailLogFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { listEmailLog, drainEmailQueue } = await import("./mail.server.ts");
    await drainEmailQueue();
    return listEmailLog();
  });

export const deletePropertyFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { deleteOwnProperty } = await import("./deletes.server.ts");
    return deleteOwnProperty(context.userId, data.id);
  });

export const pausePropertyFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { pauseOwnProperty } = await import("./deletes.server.ts");
    return pauseOwnProperty(context.userId, data.id);
  });

export const deleteRoomFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { deleteOwnRoom } = await import("./deletes.server.ts");
    return deleteOwnRoom(context.userId, data.id);
  });

export const loadOwnerRoomsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listOwnerRooms } = await import("./deletes.server.ts");
    return listOwnerRooms(context.userId);
  });

export const deleteSavedFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ propertyId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { deleteSavedStay } = await import("./deletes.server.ts");
    return deleteSavedStay(context.userId, data.propertyId);
  });

export const deleteCardFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ cardId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { deleteSavedCard } = await import("./deletes.server.ts");
    return deleteSavedCard(context.userId, data.cardId);
  });

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ password: z.string().min(8).max(200) }), input))
  .handler(async ({ context, data }) => {
    const { deleteOwnAccount } = await import("./deletes.server.ts");
    return deleteOwnAccount(context.userId, data.password);
  });

export const adminDeletePropertyFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { adminDeleteProperty } = await import("./deletes.server.ts");
    return adminDeleteProperty(context.userId, data.id);
  });

export const adminDeleteUserFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ userId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { adminDeleteUser } = await import("./deletes.server.ts");
    return adminDeleteUser(context.userId, data.userId);
  });

export const adminDeleteReviewFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { adminDeleteReview } = await import("./deletes.server.ts");
    return adminDeleteReview(context.userId, data.id);
  });

export const adminDeletePromoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ code: z.string().min(1).max(40) }), input))
  .handler(async ({ context, data }) => {
    const { adminDeletePromo } = await import("./deletes.server.ts");
    return adminDeletePromo(context.userId, data.code);
  });

export const loadPromosFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listPromos } = await import("./deletes.server.ts");
    return listPromos(context.userId);
  });

export const savePromoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(z.object({ code: z.string().min(3).max(24), percent: z.number().nullable(), amountCents: z.number().int().nullable() }), input),
  )
  .handler(async ({ context, data }) => {
    const { savePromo } = await import("./deletes.server.ts");
    return savePromo(context.userId, data);
  });

export const loadReviewsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listReviews } = await import("./deletes.server.ts");
    return listReviews(context.userId);
  });

export const loadAllPropertiesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listAllProperties } = await import("./deletes.server.ts");
    return listAllProperties(context.userId);
  });

export const setPropertyCapFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ userId: z.string().min(1), maxProperties: z.number().int().nullable() }), input))
  .handler(async ({ context, data }) => {
    const { setOwnerPropertyCap } = await import("./deletes.server.ts");
    return setOwnerPropertyCap(context.userId, data.userId, data.maxProperties);
  });

export const placeSearchFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(z.object({ query: z.string().trim().min(2).max(120) }), input))
  .handler(async ({ data }) => {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(data.query)}`, {
      headers: { Accept: "application/json", "User-Agent": "Nestora/1.0" },
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as { display_name?: string; lat?: string; lon?: string }[];
    return rows.slice(0, 5).map((row) => ({
      label: row.display_name ?? "",
      lat: Number(row.lat),
      lng: Number(row.lon),
    }));
  });




