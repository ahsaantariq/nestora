import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return parsed.data;
}

export const loadPublicPageFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(z.object({ slug: z.string().trim().min(1).max(80) }), input))
  .handler(async ({ data }) => {
    const { loadPublicPage } = await import("./content.server.ts");
    return loadPublicPage(data.slug);
  });

export const loadPublicChromeFn = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicChrome } = await import("./content.server.ts");
  return loadPublicChrome();
});

export const loadMarketplaceFn = createServerFn({ method: "GET" }).handler(async () => {
  const { loadMarketplace } = await import("./content.server.ts");
  return loadMarketplace();
});

export const loadPublicFaqsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listPublicFaqs } = await import("./content.server.ts");
  return listPublicFaqs();
});

export const subscribeNewsletterFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(z.object({ email: z.string().trim().email().max(160) }), input))
  .handler(async ({ data }) => {
    const { subscribeNewsletter } = await import("./content.server.ts");
    return subscribeNewsletter(data.email);
  });

export const submitContactFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parseInput(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().trim().email().max(160),
        phone: z.string().trim().max(40).default(""),
        subject: z.enum(["Booking", "Listing", "Payments", "Account", "Something else"]),
        message: z.string().trim().min(1).max(4000),
        companyWebsite: z.string().max(200).default(""),
      }),
      input,
    ),
  )
  .handler(async ({ data }) => {
    const { submitContact } = await import("./content.server.ts");
    return submitContact(data);
  });

export const searchBookingsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        q: z.string().max(120).default(""),
        status: z.string().max(20).default(""),
        owner: z.string().max(80).default(""),
        property: z.string().max(80).default(""),
        from: z.string().max(12).default(""),
        to: z.string().max(12).default(""),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { searchAdminBookings } = await import("./data.server.ts");
    return searchAdminBookings(context.userId, data);
  });

export const listPagesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listPages } = await import("./content.server.ts");
    return listPages(context.userId);
  });

export const loadPageAdminFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { loadPageAdmin } = await import("./content.server.ts");
    return loadPageAdmin(context.userId, data.id);
  });

export const savePageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        id: z.string().min(1),
        title: z.string().max(140),
        seoTitle: z.string().max(140).default(""),
        seoDescription: z.string().max(300).default(""),
        bodyHtml: z.string().max(200_000),
        status: z.enum(["DRAFT", "PUBLISHED"]),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { savePage } = await import("./content.server.ts");
    return savePage(context.userId, data);
  });

export const createPageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ title: z.string().min(1).max(140), slug: z.string().min(1).max(80) }), input))
  .handler(async ({ context, data }) => {
    const { createPage } = await import("./content.server.ts");
    return createPage(context.userId, data);
  });

export const deletePageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { deletePage } = await import("./content.server.ts");
    return deletePage(context.userId, data.id);
  });

export const restorePageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ versionId: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { restorePageVersion } = await import("./content.server.ts");
    return restorePageVersion(context.userId, data.versionId);
  });

export const listFaqsAdminFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listFaqsAdmin } = await import("./content.server.ts");
    return listFaqsAdmin(context.userId);
  });

export const saveFaqFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        id: z.string().optional(),
        category: z.enum(["GUESTS", "OWNERS", "PAYMENTS"]),
        question: z.string().min(1).max(200),
        answer: z.string().min(1).max(4000),
        published: z.boolean(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { saveFaq } = await import("./content.server.ts");
    return saveFaq(context.userId, data);
  });

export const deleteFaqFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { deleteFaq } = await import("./content.server.ts");
    return deleteFaq(context.userId, data.id);
  });

export const reorderFaqsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ ids: z.array(z.string()).max(200) }), input))
  .handler(async ({ context, data }) => {
    const { reorderFaqs } = await import("./content.server.ts");
    return reorderFaqs(context.userId, data.ids);
  });

export const listMessagesFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ q: z.string().max(120).default(""), status: z.string().max(20).default("") }), input))
  .handler(async ({ context, data }) => {
    const { listMessages } = await import("./content.server.ts");
    return listMessages(context.userId, data);
  });

export const setMessageStatusFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1), status: z.enum(["UNREAD", "READ", "ARCHIVED"]) }), input))
  .handler(async ({ context, data }) => {
    const { setMessageStatus } = await import("./content.server.ts");
    return setMessageStatus(context.userId, data.id, data.status);
  });

export const replyMessageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1), reply: z.string().min(1).max(4000) }), input))
  .handler(async ({ context, data }) => {
    const { replyToMessage } = await import("./content.server.ts");
    return replyToMessage(context.userId, data.id, data.reply);
  });

export const deleteMessageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseInput(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { deleteMessage } = await import("./content.server.ts");
    return deleteMessage(context.userId, data.id);
  });

export const listSubscribersFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listSubscribers } = await import("./content.server.ts");
    return listSubscribers(context.userId);
  });

export const loadNavAdminFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { loadNavAdmin } = await import("./content.server.ts");
    return loadNavAdmin(context.userId);
  });

export const saveNavigationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(
      z.object({
        links: z.array(z.object({
          id: z.string().max(80),
          placement: z.enum(["HEADER", "FOOTER"]),
          columnName: z.string().max(40),
          label: z.string().max(80),
          href: z.string().max(200),
          sortOrder: z.number().int(),
          visible: z.boolean(),
        })).max(60),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { saveNavigation } = await import("./content.server.ts");
    return saveNavigation(context.userId, data.links);
  });

export const saveContactDetailsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parseInput(z.object({ email: z.string().max(160), phone: z.string().max(40), address: z.string().max(240), hours: z.string().max(120) }), input),
  )
  .handler(async ({ context, data }) => {
    const { saveContactDetails } = await import("./content.server.ts");
    return saveContactDetails(context.userId, data);
  });
