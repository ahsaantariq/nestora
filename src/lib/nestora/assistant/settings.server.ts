import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { decryptSecret, encryptSecret, secretHint } from "../crypto.server.ts";
import { requireActive } from "../data.server.ts";
import { writeAudit } from "../audit.server.ts";

export type ChannelName = "sms" | "whatsapp" | "voice" | "messenger" | "instagram" | "email" | "web";

export type AssistantSettings = {
  enabled: boolean;
  assistantName: string;
  greeting: string;
  toneNotes: string;
  businessHours: string;
  languages: string;
  escalationRules: string;
  neverDo: string;
  discountEnabled: boolean;
  maxDiscountBps: number;
  monthlyCapCents: number;
  recordingEnabled: boolean;
  recordingNotice: string;
  humanPhone: string;
  retentionDays: number;
  smsOn: boolean;
  whatsappOn: boolean;
  voiceOn: boolean;
  messengerOn: boolean;
  instagramOn: boolean;
  emailOn: boolean;
  webOn: boolean;
  commentsOn: boolean;
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
};

export type ChannelSecrets = {
  anthropicModel: string;
  anthropicKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhone: string;
  twilioWhatsapp: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  twilioTwimlAppSid: string;
  zernioApiKey: string;
  zernioWebhookSecret: string;
  zernioFacebookAccountId: string;
  zernioInstagramAccountId: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  voicePublicUrl: string;
  voiceBridgeSecret: string;
  publicBaseUrl: string;
};

type SecretRow = {
  anthropic_key_enc: string | null;
  anthropic_model: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token_enc: string | null;
  twilio_phone: string | null;
  twilio_whatsapp: string | null;
  twilio_api_key_enc: string | null;
  twilio_api_secret_enc: string | null;
  twilio_twiml_app_sid: string | null;
  zernio_api_key_enc: string | null;
  zernio_webhook_secret_enc: string | null;
  zernio_facebook_account_id: string | null;
  zernio_instagram_account_id: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  imap_username: string | null;
  imap_password_enc: string | null;
  voice_public_url: string | null;
  voice_bridge_secret_enc: string | null;
  public_base_url: string | null;
  channel_status: unknown;
};

async function secretRow(): Promise<SecretRow | undefined> {
  const sql = await getSql();
  const rows = await sql<SecretRow>`
    select anthropic_key_enc, anthropic_model, twilio_account_sid, twilio_auth_token_enc, twilio_phone,
           twilio_whatsapp, twilio_api_key_enc, twilio_api_secret_enc, twilio_twiml_app_sid,
           zernio_api_key_enc, zernio_webhook_secret_enc, zernio_facebook_account_id, zernio_instagram_account_id,
           imap_host, imap_port, imap_secure, imap_username, imap_password_enc, voice_public_url,
           voice_bridge_secret_enc, public_base_url, channel_status
    from integration_settings where id = 1
  `;
  return rows[0];
}

export async function readSecrets(): Promise<ChannelSecrets> {
  const row = await secretRow();
  return {
    anthropicModel: row?.anthropic_model?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5",
    anthropicKey: decryptSecret(row?.anthropic_key_enc) || process.env.ANTHROPIC_API_KEY?.trim() || "",
    twilioAccountSid: row?.twilio_account_sid?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim() || "",
    twilioAuthToken: decryptSecret(row?.twilio_auth_token_enc) || process.env.TWILIO_AUTH_TOKEN?.trim() || "",
    twilioPhone: row?.twilio_phone?.trim() || process.env.TWILIO_PHONE_NUMBER?.trim() || "",
    twilioWhatsapp: row?.twilio_whatsapp?.trim() || process.env.TWILIO_WHATSAPP_NUMBER?.trim() || "",
    twilioApiKey: decryptSecret(row?.twilio_api_key_enc) || process.env.TWILIO_API_KEY?.trim() || "",
    twilioApiSecret: decryptSecret(row?.twilio_api_secret_enc) || process.env.TWILIO_API_SECRET?.trim() || "",
    twilioTwimlAppSid: row?.twilio_twiml_app_sid?.trim() || process.env.TWILIO_TWIML_APP_SID?.trim() || "",
    zernioApiKey: decryptSecret(row?.zernio_api_key_enc) || process.env.ZERNIO_API_KEY?.trim() || "",
    zernioWebhookSecret: decryptSecret(row?.zernio_webhook_secret_enc) || process.env.ZERNIO_WEBHOOK_SECRET?.trim() || "",
    zernioFacebookAccountId: row?.zernio_facebook_account_id?.trim() || "",
    zernioInstagramAccountId: row?.zernio_instagram_account_id?.trim() || "",
    imapHost: row?.imap_host?.trim() || "",
    imapPort: row?.imap_port || 993,
    imapSecure: row?.imap_secure !== false,
    imapUsername: row?.imap_username?.trim() || "",
    imapPassword: decryptSecret(row?.imap_password_enc) || "",
    voicePublicUrl: row?.voice_public_url?.trim() || process.env.VOICE_PUBLIC_URL?.trim() || "",
    voiceBridgeSecret: decryptSecret(row?.voice_bridge_secret_enc) || process.env.VOICE_BRIDGE_SECRET?.trim() || "",
    publicBaseUrl: (row?.public_base_url?.trim() || process.env.PUBLIC_APP_URL?.trim() || "").replace(/\/$/, ""),
  };
}

export async function readAssistantSettings(): Promise<AssistantSettings> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`select * from assistant_settings where id = 1`;
  const row = rows[0] ?? {};
  return {
    enabled: Boolean(row.enabled),
    assistantName: String(row.assistant_name ?? "Nia"),
    greeting: String(row.greeting ?? ""),
    toneNotes: String(row.tone_notes ?? ""),
    businessHours: String(row.business_hours ?? ""),
    languages: String(row.languages ?? ""),
    escalationRules: String(row.escalation_rules ?? ""),
    neverDo: String(row.never_do ?? ""),
    discountEnabled: Boolean(row.discount_enabled),
    maxDiscountBps: Number(row.max_discount_bps ?? 0),
    monthlyCapCents: Number(row.monthly_cap_cents ?? 0),
    recordingEnabled: row.recording_enabled !== false,
    recordingNotice: String(row.recording_notice ?? ""),
    humanPhone: String(row.human_phone ?? ""),
    retentionDays: Number(row.retention_days ?? 90),
    smsOn: Boolean(row.sms_on),
    whatsappOn: Boolean(row.whatsapp_on),
    voiceOn: Boolean(row.voice_on),
    messengerOn: Boolean(row.messenger_on),
    instagramOn: Boolean(row.instagram_on),
    emailOn: Boolean(row.email_on),
    webOn: row.web_on !== false,
    commentsOn: Boolean(row.comments_on),
    inputUsdPerMtok: Number(row.input_usd_per_mtok ?? 3),
    outputUsdPerMtok: Number(row.output_usd_per_mtok ?? 15),
  };
}

export function channelEnabled(settings: AssistantSettings, channel: ChannelName): boolean {
  if (!settings.enabled) return false;
  if (channel === "sms") return settings.smsOn;
  if (channel === "whatsapp") return settings.whatsappOn;
  if (channel === "voice") return settings.voiceOn;
  if (channel === "messenger") return settings.messengerOn;
  if (channel === "instagram") return settings.instagramOn;
  if (channel === "email") return settings.emailOn;
  return settings.webOn;
}

export async function saveAssistantSettings(actorId: string, input: AssistantSettings) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const sql = await getSql();
  await sql`
    update assistant_settings set
      enabled = ${input.enabled},
      assistant_name = ${input.assistantName.slice(0, 40)},
      greeting = ${input.greeting.slice(0, 500)},
      tone_notes = ${input.toneNotes.slice(0, 1000)},
      business_hours = ${input.businessHours.slice(0, 200)},
      languages = ${input.languages.slice(0, 300)},
      escalation_rules = ${input.escalationRules.slice(0, 1000)},
      never_do = ${input.neverDo.slice(0, 1000)},
      discount_enabled = ${input.discountEnabled},
      max_discount_bps = ${Math.max(0, Math.min(10000, Math.round(input.maxDiscountBps)))},
      monthly_cap_cents = ${Math.max(0, Math.round(input.monthlyCapCents))},
      recording_enabled = ${input.recordingEnabled},
      recording_notice = ${input.recordingNotice.slice(0, 300)},
      human_phone = ${input.humanPhone.slice(0, 30)},
      retention_days = ${Math.max(1, Math.min(3650, Math.round(input.retentionDays)))},
      sms_on = ${input.smsOn},
      whatsapp_on = ${input.whatsappOn},
      voice_on = ${input.voiceOn},
      messenger_on = ${input.messengerOn},
      instagram_on = ${input.instagramOn},
      email_on = ${input.emailOn},
      web_on = ${input.webOn},
      comments_on = ${input.commentsOn},
      input_usd_per_mtok = ${input.inputUsdPerMtok},
      output_usd_per_mtok = ${input.outputUsdPerMtok}
    where id = 1
  `;
  await writeAudit(actor.userId, "assistant.settings", "assistant_settings", { enabled: input.enabled });
  return readAssistantSettings();
}

export type SecretInput = {
  anthropicModel: string;
  anthropicKey: string;
  clearAnthropic: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  clearTwilioToken: boolean;
  twilioPhone: string;
  twilioWhatsapp: string;
  twilioApiKey: string;
  clearTwilioApiKey: boolean;
  twilioApiSecret: string;
  clearTwilioApiSecret: boolean;
  twilioTwimlAppSid: string;
  zernioApiKey: string;
  clearZernioKey: boolean;
  zernioWebhookSecret: string;
  clearZernioSecret: boolean;
  zernioFacebookAccountId: string;
  zernioInstagramAccountId: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  clearImapPassword: boolean;
  voicePublicUrl: string;
  publicBaseUrl: string;
};

function keepOrReplace(current: string | null, next: string, clear: boolean): string | null {
  if (clear) return null;
  if (next.trim()) return encryptSecret(next.trim());
  return current;
}

export async function saveChannelSecrets(actorId: string, input: SecretInput) {
  const actor = await requireActive(actorId, ["ADMIN"]);
  const current = await secretRow();
  const sql = await getSql();
  const port = input.imapPort.trim() ? Number(input.imapPort) : null;
  if (port != null && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("IMAP port must be between 1 and 65535.");
  let bridge = current?.voice_bridge_secret_enc ?? null;
  if (!bridge) bridge = encryptSecret(randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""));
  await sql`
    update integration_settings set
      anthropic_model = ${input.anthropicModel.trim() || "claude-sonnet-4-5"},
      anthropic_key_enc = ${keepOrReplace(current?.anthropic_key_enc ?? null, input.anthropicKey, input.clearAnthropic)},
      twilio_account_sid = ${input.twilioAccountSid.trim() || null},
      twilio_auth_token_enc = ${keepOrReplace(current?.twilio_auth_token_enc ?? null, input.twilioAuthToken, input.clearTwilioToken)},
      twilio_phone = ${input.twilioPhone.trim() || null},
      twilio_whatsapp = ${input.twilioWhatsapp.trim() || null},
      twilio_api_key_enc = ${keepOrReplace(current?.twilio_api_key_enc ?? null, input.twilioApiKey, input.clearTwilioApiKey)},
      twilio_api_secret_enc = ${keepOrReplace(current?.twilio_api_secret_enc ?? null, input.twilioApiSecret, input.clearTwilioApiSecret)},
      twilio_twiml_app_sid = ${input.twilioTwimlAppSid.trim() || null},
      zernio_api_key_enc = ${keepOrReplace(current?.zernio_api_key_enc ?? null, input.zernioApiKey, input.clearZernioKey)},
      zernio_webhook_secret_enc = ${keepOrReplace(current?.zernio_webhook_secret_enc ?? null, input.zernioWebhookSecret, input.clearZernioSecret)},
      zernio_facebook_account_id = ${input.zernioFacebookAccountId.trim() || null},
      zernio_instagram_account_id = ${input.zernioInstagramAccountId.trim() || null},
      imap_host = ${input.imapHost.trim() || null},
      imap_port = ${port},
      imap_secure = ${input.imapSecure},
      imap_username = ${input.imapUsername.trim() || null},
      imap_password_enc = ${keepOrReplace(current?.imap_password_enc ?? null, input.imapPassword, input.clearImapPassword)},
      voice_public_url = ${input.voicePublicUrl.trim() || null},
      voice_bridge_secret_enc = ${bridge},
      public_base_url = ${input.publicBaseUrl.trim().replace(/\/$/, "") || null},
      updated_at = now(),
      updated_by = ${actor.userId}
    where id = 1
  `;
  await writeAudit(actor.userId, "assistant.secrets", "integration_settings", { model: input.anthropicModel.trim() });
  return channelView();
}

export async function channelView() {
  const secrets = await readSecrets();
  const row = await secretRow();
  const raw = (row?.channel_status && typeof row.channel_status === "object" ? row.channel_status : {}) as Record<string, { ok?: boolean; error?: string; at?: string }>;
  const status = Object.entries(raw).map(([channel, value]) => ({
    channel,
    ok: Boolean(value?.ok),
    error: typeof value?.error === "string" ? value.error : "",
    at: typeof value?.at === "string" ? value.at : "",
  }));
  const base = secrets.publicBaseUrl;
  return {
    anthropicModel: secrets.anthropicModel,
    anthropicHint: secretHint(secrets.anthropicKey),
    twilioAccountSid: secrets.twilioAccountSid,
    twilioTokenHint: secretHint(secrets.twilioAuthToken),
    twilioPhone: secrets.twilioPhone,
    twilioWhatsapp: secrets.twilioWhatsapp,
    twilioApiKeyHint: secretHint(secrets.twilioApiKey),
    twilioApiSecretHint: secretHint(secrets.twilioApiSecret),
    twilioTwimlAppSid: secrets.twilioTwimlAppSid,
    zernioHint: secretHint(secrets.zernioApiKey),
    zernioSecretHint: secretHint(secrets.zernioWebhookSecret),
    zernioFacebookAccountId: secrets.zernioFacebookAccountId,
    zernioInstagramAccountId: secrets.zernioInstagramAccountId,
    imapHost: secrets.imapHost,
    imapPort: secrets.imapPort ? String(secrets.imapPort) : "",
    imapSecure: secrets.imapSecure,
    imapUsername: secrets.imapUsername,
    imapPasswordHint: secretHint(secrets.imapPassword),
    voicePublicUrl: secrets.voicePublicUrl,
    voiceBridgeHint: secretHint(secrets.voiceBridgeSecret),
    publicBaseUrl: secrets.publicBaseUrl,
    webhooks: {
      sms: `${base}/api/twilio/sms`,
      whatsapp: `${base}/api/twilio/whatsapp`,
      voice: `${base}/api/twilio/voice-answer`,
      voiceStatus: `${base}/api/twilio/voice-status`,
      zernio: `${base}/api/zernio/webhook`,
      worker: `${base}/api/assistant/worker`,
    },
    status,
  };
}

export async function setChannelStatus(channel: string, ok: boolean, error?: string) {
  const sql = await getSql();
  const row = await secretRow();
  const status = (row?.channel_status && typeof row.channel_status === "object" ? row.channel_status : {}) as Record<string, unknown>;
  status[channel] = { ok, error: error ? error.slice(0, 240) : null, at: new Date().toISOString() };
  await sql`update integration_settings set channel_status = ${JSON.stringify(status)}::jsonb where id = 1`;
}

export async function monthSpendCents(): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ cents: number }>`
    select coalesce(sum(cost_cents), 0)::int as cents from ai_usage
    where created_at >= date_trunc('month', now())
  `;
  return rows[0]?.cents ?? 0;
}

export async function recordUsage(conversationId: string | null, model: string, inputTokens: number, outputTokens: number) {
  const settings = await readAssistantSettings();
  const cents = Math.round(
    (inputTokens / 1_000_000) * settings.inputUsdPerMtok * 100 + (outputTokens / 1_000_000) * settings.outputUsdPerMtok * 100,
  );
  const sql = await getSql();
  await sql`
    insert into ai_usage (id, conversation_id, model, input_tokens, output_tokens, cost_cents)
    values (${randomUUID()}, ${conversationId}, ${model}, ${inputTokens}, ${outputTokens}, ${cents})
  `;
  const spent = await monthSpendCents();
  if (settings.monthlyCapCents > 0 && spent >= settings.monthlyCapCents * 0.8) {
    const month = new Date().toISOString().slice(0, 7);
    const flagged = await sql<{ alerted_month: string | null }>`select alerted_month from assistant_settings where id = 1`;
    if (flagged[0]?.alerted_month !== month) {
      await sql`update assistant_settings set alerted_month = ${month} where id = 1`;
      const { sendMail } = await import("../mail.server.ts");
      const admins = await sql<{ email: string }>`
        select u.email from profiles p join "user" u on u.id = p.user_id
        where p.role = 'ADMIN' and p.account_status = 'ACTIVE'
      `;
      for (const admin of admins) {
        await sendMail({
          to: admin.email,
          template: "ai-cap",
          subject: "Nestora AI usage is at 80%",
          text: `AI usage this month is ${ (spent / 100).toFixed(2) } of a ${ (settings.monthlyCapCents / 100).toFixed(2) } cap.`,
        });
      }
    }
  }
}
