import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return parsed.data;
}

const channel = z.enum(["sms", "whatsapp", "voice", "messenger", "instagram", "email", "web"]);

export const loadAssistantSettingsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { readAssistantSettings } = await import("./assistant/settings.server.ts");
    return readAssistantSettings();
  });

export const saveAssistantSettingsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({
    enabled: z.boolean(),
    assistantName: z.string().min(1).max(40),
    greeting: z.string().max(500),
    toneNotes: z.string().max(1000),
    businessHours: z.string().max(200),
    languages: z.string().max(300),
    escalationRules: z.string().max(1000),
    neverDo: z.string().max(1000),
    discountEnabled: z.boolean(),
    maxDiscountBps: z.number().int().min(0).max(10000),
    monthlyCapCents: z.number().int().min(0),
    recordingEnabled: z.boolean(),
    recordingNotice: z.string().max(300),
    humanPhone: z.string().max(30),
    retentionDays: z.number().int().min(1).max(3650),
    smsOn: z.boolean(),
    whatsappOn: z.boolean(),
    voiceOn: z.boolean(),
    messengerOn: z.boolean(),
    instagramOn: z.boolean(),
    emailOn: z.boolean(),
    webOn: z.boolean(),
    commentsOn: z.boolean(),
    inputUsdPerMtok: z.number().min(0).max(1000),
    outputUsdPerMtok: z.number().min(0).max(1000),
  }), input))
  .handler(async ({ context, data }) => {
    const { saveAssistantSettings } = await import("./assistant/settings.server.ts");
    return saveAssistantSettings(context.userId, data);
  });

export const loadChannelSecretsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { channelView } = await import("./assistant/settings.server.ts");
    return channelView();
  });

export const saveChannelSecretsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({
    anthropicModel: z.string().min(1).max(80),
    anthropicKey: z.string().max(300).default(""),
    clearAnthropic: z.boolean().default(false),
    twilioAccountSid: z.string().max(80).default(""),
    twilioAuthToken: z.string().max(200).default(""),
    clearTwilioToken: z.boolean().default(false),
    twilioPhone: z.string().max(30).default(""),
    twilioWhatsapp: z.string().max(40).default(""),
    twilioApiKey: z.string().max(80).default(""),
    clearTwilioApiKey: z.boolean().default(false),
    twilioApiSecret: z.string().max(200).default(""),
    clearTwilioApiSecret: z.boolean().default(false),
    twilioTwimlAppSid: z.string().max(80).default(""),
    zernioApiKey: z.string().max(300).default(""),
    clearZernioKey: z.boolean().default(false),
    zernioWebhookSecret: z.string().max(300).default(""),
    clearZernioSecret: z.boolean().default(false),
    zernioFacebookAccountId: z.string().max(80).default(""),
    zernioInstagramAccountId: z.string().max(80).default(""),
    imapHost: z.string().max(120).default(""),
    imapPort: z.string().max(6).default(""),
    imapSecure: z.boolean().default(true),
    imapUsername: z.string().max(120).default(""),
    imapPassword: z.string().max(200).default(""),
    clearImapPassword: z.boolean().default(false),
    voicePublicUrl: z.string().max(200).default(""),
    publicBaseUrl: z.string().max(200).default(""),
  }), input))
  .handler(async ({ context, data }) => {
    const { saveChannelSecrets } = await import("./assistant/settings.server.ts");
    return saveChannelSecrets(context.userId, data);
  });

export const testChannelFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ channel: z.enum(["anthropic", "twilio", "zernio", "imap"]) }), input))
  .handler(async ({ context, data }) => {
    const { testChannel } = await import("./assistant/desk.server.ts");
    return testChannel(context.userId, data.channel);
  });

export const listConversationsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({
    q: z.string().max(80).default(""),
    channel: z.string().max(20).default(""),
    status: z.string().max(20).default(""),
    mode: z.string().max(20).default(""),
    unread: z.boolean().default(false),
    booked: z.string().max(8).default(""),
    sinceDays: z.number().int().min(0).max(3650).default(0),
  }), input))
  .handler(async ({ context, data }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { listInbox } = await import("./assistant/inbox.server.ts");
    return listInbox(data);
  });

export const loadThreadFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.string().min(1) }), input))
  .handler(async ({ context, data }) => {
    const { thread } = await import("./assistant/desk.server.ts");
    return thread(context.userId, data.id);
  });

export const adminReplyFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({
    conversationId: z.string().min(1),
    channel: channel,
    text: z.string().max(4000).default(""),
    templateName: z.string().max(80).optional(),
  }), input))
  .handler(async ({ context, data }) => {
    const { adminSend } = await import("./assistant/desk.server.ts");
    return adminSend(context.userId, data);
  });

export const setModeFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.string(), mode: z.enum(["AI", "HUMAN"]) }), input))
  .handler(async ({ context, data }) => {
    const { setMode } = await import("./assistant/desk.server.ts");
    return setMode(context.userId, data.id, data.mode);
  });

export const assignConversationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.string(), assignee: z.string().max(120).default("") }), input))
  .handler(async ({ context, data }) => {
    const { setAssignment } = await import("./assistant/desk.server.ts");
    return setAssignment(context.userId, data.id, data.assignee);
  });

export const resolveConversationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.string(), resolved: z.boolean() }), input))
  .handler(async ({ context, data }) => {
    const { setResolved } = await import("./assistant/desk.server.ts");
    return setResolved(context.userId, data.id, data.resolved);
  });

export const noteConversationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.string(), body: z.string().min(1).max(2000) }), input))
  .handler(async ({ context, data }) => {
    const { addInternalNote } = await import("./assistant/desk.server.ts");
    return addInternalNote(context.userId, data.id, data.body);
  });

export const mergeContactsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ keepId: z.string(), dropId: z.string() }), input))
  .handler(async ({ context, data }) => {
    const { mergeContacts } = await import("./assistant/desk.server.ts");
    return mergeContacts(context.userId, data.keepId, data.dropId);
  });

export const unmergeContactsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ keepId: z.string() }), input))
  .handler(async ({ context, data }) => {
    const { unmergeContacts } = await import("./assistant/desk.server.ts");
    return unmergeContacts(context.userId, data.keepId);
  });

export const revealBridgeSecretFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { readSecrets } = await import("./assistant/settings.server.ts");
    const secrets = await readSecrets();
    return { secret: secrets.voiceBridgeSecret };
  });

export const deleteContactFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.string() }), input))
  .handler(async ({ context, data }) => {
    const { deleteContactData } = await import("./assistant/desk.server.ts");
    return deleteContactData(context.userId, data.id);
  });

export const listTemplatesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listTemplates } = await import("./assistant/desk.server.ts");
    return listTemplates(context.userId);
  });

export const saveTemplateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({
    channel: z.string().min(2).max(20),
    name: z.string().min(1).max(80),
    language: z.string().min(2).max(12),
    body: z.string().max(2000),
    approved: z.boolean(),
  }), input))
  .handler(async ({ context, data }) => {
    const { saveTemplate } = await import("./assistant/desk.server.ts");
    return saveTemplate(context.userId, data);
  });

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.string() }), input))
  .handler(async ({ context, data }) => {
    const { deleteTemplate } = await import("./assistant/desk.server.ts");
    return deleteTemplate(context.userId, data.id);
  });

export const listCallsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listCalls } = await import("./assistant/desk.server.ts");
    return listCalls(context.userId);
  });

export const assistantAnalyticsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { assistantAnalytics } = await import("./assistant/desk.server.ts");
    return assistantAnalytics(context.userId);
  });

export const manualBookFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({
    conversationId: z.string(),
    slug: z.string().min(1),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    adults: z.number().int().min(1).max(16),
    name: z.string().min(1).max(80),
    phone: z.string().max(30),
    email: z.string().email(),
    channel: channel,
  }), input))
  .handler(async ({ context, data }) => {
    const { manualHold } = await import("./assistant/desk.server.ts");
    return manualHold(context.userId, data);
  });

export const resendLinkFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ conversationId: z.string(), bookingId: z.string(), channel: channel }), input))
  .handler(async ({ context, data }) => {
    const { requireActive } = await import("./data.server.ts");
    await requireActive(context.userId, ["ADMIN"]);
    const { createPaymentLink } = await import("./assistant/flow.server.ts");
    const { sendOnChannel } = await import("./assistant/channels.server.ts");
    const link = await createPaymentLink(data.bookingId);
    await sendOnChannel({ conversationId: data.conversationId, channel: data.channel, to: "", text: `Payment link: ${link.url}`, sender: "ADMIN" });
    return link;
  });

export const placeCallFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ to: z.string().min(8).max(30) }), input))
  .handler(async ({ context, data }) => {
    const { placeOutboundCall } = await import("./assistant/desk.server.ts");
    return placeOutboundCall(context.userId, data.to);
  });

export const browserTokenFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireActive } = await import("./data.server.ts");
    const actor = await requireActive(context.userId, ["ADMIN"]);
    const { readSecrets } = await import("./assistant/settings.server.ts");
    const { browserCallToken } = await import("./assistant/desk.server.ts");
    const secrets = await readSecrets();
    return { token: browserCallToken(`admin-${actor.userId.slice(0, 12)}`, secrets) };
  });

export const assistantPublicConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readAssistantSettings } = await import("./assistant/settings.server.ts");
  const settings = await readAssistantSettings();
  return { enabled: settings.enabled && settings.webOn, name: settings.assistantName, greeting: settings.greeting };
});

export const assistantChatFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(z.object({
    sessionId: z.string().min(8).max(80),
    text: z.string().trim().min(1).max(2000),
  }), input))
  .handler(async ({ data }) => {
    const { handleInbound } = await import("./assistant/inbound.server.ts");
    const reply = await handleInbound({
      channel: "web",
      externalUserId: data.sessionId,
      messageId: `${data.sessionId}:${Date.now()}`,
      text: data.text,
    });
    return { reply };
  });

export const claimWelcomeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(z.object({ token: z.string().min(10), password: z.string().min(8).max(200) }), input))
  .handler(async ({ data }) => {
    const { setWelcomePassword } = await import("./assistant/flow.server.ts");
    return setWelcomePassword(data.token, data.password);
  });
