import { useEffect, useState } from "react";
import {
  deleteTemplateFn,
  listTemplatesFn,
  loadAssistantSettingsFn,
  loadChannelSecretsFn,
  revealBridgeSecretFn,
  saveAssistantSettingsFn,
  saveChannelSecretsFn,
  saveTemplateFn,
  testChannelFn,
} from "@/lib/nestora/assistant.fns";
import { AsyncForm, TextField, ToggleField, useConfirm } from "@/components/forms";
import { Button, SelectInput, TextArea, TextInput } from "@/components/ui";

type Settings = Awaited<ReturnType<typeof loadAssistantSettingsFn>>;
type Channels = Awaited<ReturnType<typeof loadChannelSecretsFn>>;
type Template = Awaited<ReturnType<typeof listTemplatesFn>>[number];

function copy(value: string) {
  void navigator.clipboard?.writeText(value);
}

function Light({ ok }: { ok: boolean | null }) {
  const tone = ok === null ? "bg-[#D9D3C7]" : ok ? "bg-primary" : "bg-danger";
  const label = ok === null ? "Not tested" : ok ? "Connected" : "Error";
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`size-2.5 rounded-full ${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function AssistantIntegrations() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    Promise.all([loadAssistantSettingsFn(), loadChannelSecretsFn(), listTemplatesFn()])
      .then(([nextSettings, nextChannels, nextTemplates]) => {
        setSettings(nextSettings);
        setChannels(nextChannels);
        setTemplates(nextTemplates);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Assistant settings didn't load."));
  }, []);

  if (!settings || !channels) {
    return error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-muted">Loading the assistant…</p>;
  }

  return (
    <div className="mt-8 space-y-6">
      {confirm.dialog}
      <h2 className="font-display text-3xl">Assistant</h2>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {notice ? <p className="text-sm text-primary">{notice}</p> : null}
      <SettingsForm initial={settings} onSaved={setSettings} onError={setError} onNotice={setNotice} />
      <SecretsForm initial={channels} onSaved={setChannels} onError={setError} onNotice={setNotice} />
      <TemplateManager templates={templates} confirm={confirm} onChange={setTemplates} onError={setError} />
    </div>
  );
}

function SettingsForm({
  initial,
  onSaved,
  onError,
  onNotice,
}: {
  initial: Settings;
  onSaved: (next: Settings) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const [form, setForm] = useState(initial);
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <AsyncForm
      className="space-y-4 rounded-card bg-white p-5 shadow-soft"
      onSubmit={async () => {
        onError(null);
        const next = await saveAssistantSettingsFn({ data: form });
        onSaved(next);
        setForm(next);
        onNotice("Assistant settings saved.");
      }}
    >
      {(busy) => (
        <>
          <h3 className="font-display text-2xl">How Nia behaves</h3>
          <ToggleField label="Assistant enabled" checked={form.enabled} hint="Off means every channel waits for a person." onChange={(value) => set("enabled", value)} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Name" value={form.assistantName} onChange={(value) => set("assistantName", value)} />
            <TextField label="Business hours" value={form.businessHours} onChange={(value) => set("businessHours", value)} />
            <TextField label="Greeting" value={form.greeting} onChange={(value) => set("greeting", value)} />
            <TextField label="Languages" value={form.languages} onChange={(value) => set("languages", value)} />
            <TextField label="Tone notes" value={form.toneNotes} onChange={(value) => set("toneNotes", value)} />
            <TextField label="Escalation rules" value={form.escalationRules} onChange={(value) => set("escalationRules", value)} />
            <TextField label="Never do" value={form.neverDo} onChange={(value) => set("neverDo", value)} />
            <TextField label="Human phone for call handoff" value={form.humanPhone} onChange={(value) => set("humanPhone", value)} />
            <TextField label="Monthly AI cap (dollars)" value={String(form.monthlyCapCents / 100)} onChange={(value) => set("monthlyCapCents", Math.round(Number(value || 0) * 100))} />
            <TextField label="Max discount (%)" value={String(form.maxDiscountBps / 100)} onChange={(value) => set("maxDiscountBps", Math.round(Number(value || 0) * 100))} hint="Used only when discounts are on." />
            <TextField label="Input $ / million tokens" value={String(form.inputUsdPerMtok)} onChange={(value) => set("inputUsdPerMtok", Number(value || 0))} />
            <TextField label="Output $ / million tokens" value={String(form.outputUsdPerMtok)} onChange={(value) => set("outputUsdPerMtok", Number(value || 0))} />
            <TextField label="Keep recordings (days)" value={String(form.retentionDays)} onChange={(value) => set("retentionDays", Math.max(1, Number(value || 1)))} />
            <TextField label="Recording notice" value={form.recordingNotice} onChange={(value) => set("recordingNotice", value)} />
          </div>
          <ToggleField label="Allow discounts" checked={form.discountEnabled} hint="Off by default. The assistant cannot invent a discount." onChange={(value) => set("discountEnabled", value)} />
          <ToggleField label="Record calls" checked={form.recordingEnabled} onChange={(value) => set("recordingEnabled", value)} />
          <div className="grid gap-3 md:grid-cols-2">
            <ToggleField label="SMS" checked={form.smsOn} onChange={(value) => set("smsOn", value)} />
            <ToggleField label="WhatsApp" checked={form.whatsappOn} onChange={(value) => set("whatsappOn", value)} />
            <ToggleField label="Voice" checked={form.voiceOn} onChange={(value) => set("voiceOn", value)} />
            <ToggleField label="Messenger" checked={form.messengerOn} onChange={(value) => set("messengerOn", value)} />
            <ToggleField label="Instagram" checked={form.instagramOn} onChange={(value) => set("instagramOn", value)} />
            <ToggleField label="Email" checked={form.emailOn} onChange={(value) => set("emailOn", value)} />
            <ToggleField label="Website chat" checked={form.webOn} onChange={(value) => set("webOn", value)} />
            <ToggleField label="Social comments" checked={form.commentsOn} hint="Leave off. Comments are ignored until you turn this on." onChange={(value) => set("commentsOn", value)} />
          </div>
          <Button type="submit" loading={busy} loadingLabel="Saving...">Save assistant</Button>
        </>
      )}
    </AsyncForm>
  );
}

function SecretsForm({
  initial,
  onSaved,
  onError,
  onNotice,
}: {
  initial: Channels;
  onSaved: (next: Channels) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const [model, setModel] = useState(initial.anthropicModel);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [sid, setSid] = useState(initial.twilioAccountSid);
  const [token, setToken] = useState("");
  const [phone, setPhone] = useState(initial.twilioPhone);
  const [whatsapp, setWhatsapp] = useState(initial.twilioWhatsapp);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [appSid, setAppSid] = useState(initial.twilioTwimlAppSid);
  const [zernioKey, setZernioKey] = useState("");
  const [zernioSecret, setZernioSecret] = useState("");
  const [facebook, setFacebook] = useState(initial.zernioFacebookAccountId);
  const [instagram, setInstagram] = useState(initial.zernioInstagramAccountId);
  const [imapHost, setImapHost] = useState(initial.imapHost);
  const [imapPort, setImapPort] = useState(initial.imapPort);
  const [imapSecure, setImapSecure] = useState(initial.imapSecure);
  const [imapUser, setImapUser] = useState(initial.imapUsername);
  const [imapPassword, setImapPassword] = useState("");
  const [voiceUrl, setVoiceUrl] = useState(initial.voicePublicUrl);
  const [siteUrl, setSiteUrl] = useState(initial.publicBaseUrl);
  const [testing, setTesting] = useState<string | null>(null);
  const [bridge, setBridge] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const statusFor = (name: string) => initial.status.find((item) => item.channel === name);

  async function test(channel: "anthropic" | "twilio" | "zernio" | "imap") {
    setTesting(channel);
    onError(null);
    try {
      await testChannelFn({ data: { channel } });
      onNotice(`${channel} accepted the saved credentials.`);
      onSaved(await loadChannelSecretsFn());
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Test failed.");
      onSaved(await loadChannelSecretsFn().catch(() => initial));
    } finally {
      setTesting(null);
    }
  }

  return (
    <AsyncForm
      className="space-y-4 rounded-card bg-white p-5 shadow-soft"
      onSubmit={async () => {
        onError(null);
        const next = await saveChannelSecretsFn({
          data: {
            anthropicModel: model,
            anthropicKey,
            clearAnthropic: false,
            twilioAccountSid: sid,
            twilioAuthToken: token,
            clearTwilioToken: false,
            twilioPhone: phone,
            twilioWhatsapp: whatsapp,
            twilioApiKey: apiKey,
            clearTwilioApiKey: false,
            twilioApiSecret: apiSecret,
            clearTwilioApiSecret: false,
            twilioTwimlAppSid: appSid,
            zernioApiKey: zernioKey,
            clearZernioKey: false,
            zernioWebhookSecret: zernioSecret,
            clearZernioSecret: false,
            zernioFacebookAccountId: facebook,
            zernioInstagramAccountId: instagram,
            imapHost,
            imapPort,
            imapSecure,
            imapUsername: imapUser,
            imapPassword,
            clearImapPassword: false,
            voicePublicUrl: voiceUrl,
            publicBaseUrl: siteUrl || origin,
          },
        });
        onSaved(next);
        setAnthropicKey("");
        setToken("");
        setApiKey("");
        setApiSecret("");
        setZernioKey("");
        setZernioSecret("");
        setImapPassword("");
        onNotice("Channel secrets saved. Blank secret fields kept the previous value.");
      }}
    >
      {(busy) => (
        <>
          <h3 className="font-display text-2xl">Channel credentials</h3>
          <p className="text-sm text-muted">Leave a secret blank to keep the saved one. Hints show only the last characters.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Claude model" value={model} onChange={setModel} hint="Change this when you want a different model." />
            <TextField label="Anthropic API key" type="password" value={anthropicKey} onChange={setAnthropicKey} hint={initial.anthropicHint || "Not saved yet."} />
            <TextField label="Twilio Account SID" value={sid} onChange={setSid} />
            <TextField label="Twilio auth token" type="password" value={token} onChange={setToken} hint={initial.twilioTokenHint || "Not saved yet."} />
            <TextField label="Twilio phone number" value={phone} onChange={setPhone} />
            <TextField label="WhatsApp sender" value={whatsapp} onChange={setWhatsapp} hint="The number, without whatsapp:." />
            <TextField label="Twilio API key SID" value={apiKey} onChange={setApiKey} hint={initial.twilioApiKeyHint || "For browser calling."} />
            <TextField label="Twilio API secret" type="password" value={apiSecret} onChange={setApiSecret} hint={initial.twilioApiSecretHint || "Not saved yet."} />
            <TextField label="TwiML app SID" value={appSid} onChange={setAppSid} />
            <TextField label="Zernio API key" type="password" value={zernioKey} onChange={setZernioKey} hint={initial.zernioHint || "Not saved yet."} />
            <TextField label="Zernio webhook secret" type="password" value={zernioSecret} onChange={setZernioSecret} hint={initial.zernioSecretHint || "You choose this secret and paste it into Zernio."} />
            <TextField label="Zernio Facebook account id" value={facebook} onChange={setFacebook} />
            <TextField label="Zernio Instagram account id" value={instagram} onChange={setInstagram} />
            <TextField label="IMAP host" value={imapHost} onChange={setImapHost} />
            <TextField label="IMAP port" value={imapPort} onChange={setImapPort} />
            <TextField label="IMAP username" value={imapUser} onChange={setImapUser} />
            <TextField label="IMAP password" type="password" value={imapPassword} onChange={setImapPassword} hint={initial.imapPasswordHint || "Not saved yet."} />
            <TextField label="Public site URL" value={siteUrl} onChange={setSiteUrl} hint={origin ? `This browser is on ${origin}` : "https://your-domain"} />
            <TextField label="Voice service URL" value={voiceUrl} onChange={setVoiceUrl} hint="https://voice.your-domain — Nestora adds /relay." />
          </div>
          <ToggleField label="IMAP uses TLS" checked={imapSecure} onChange={setImapSecure} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="quiet" loading={testing === "anthropic"} loadingLabel="Testing..." onClick={() => void test("anthropic")}><Light ok={statusFor("anthropic") ? statusFor("anthropic")!.ok : null} /> Test Anthropic</Button>
            <Button type="button" variant="quiet" loading={testing === "twilio"} loadingLabel="Testing..." onClick={() => void test("twilio")}><Light ok={statusFor("twilio") ? statusFor("twilio")!.ok : null} /> Test Twilio</Button>
            <Button type="button" variant="quiet" loading={testing === "zernio"} loadingLabel="Testing..." onClick={() => void test("zernio")}><Light ok={statusFor("zernio") ? statusFor("zernio")!.ok : null} /> Test Zernio</Button>
            <Button type="button" variant="quiet" loading={testing === "imap"} loadingLabel="Testing..." onClick={() => void test("imap")}><Light ok={statusFor("imap") ? statusFor("imap")!.ok : null} /> Test IMAP</Button>
          </div>
          <WebhookList base={siteUrl || origin} paths={initial.webhooks} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="quiet" onClick={() => {
              revealBridgeSecretFn().then((result) => setBridge(result.secret)).catch((reason: unknown) => onError(reason instanceof Error ? reason.message : "Could not show the bridge secret."));
            }}>Show voice bridge secret</Button>
            {bridge ? <code className="break-all text-xs">{bridge}</code> : <span className="text-sm text-muted">{initial.voiceBridgeHint || "Save once to create it."}</span>}
          </div>
          <Button type="submit" loading={busy} loadingLabel="Saving...">Save channel credentials</Button>
        </>
      )}
    </AsyncForm>
  );
}

function WebhookList({ base, paths }: { base: string; paths: Channels["webhooks"] }) {
  const rows = [
    ["Twilio SMS", `${base}/api/twilio/sms`],
    ["Twilio WhatsApp", `${base}/api/twilio/whatsapp`],
    ["Twilio voice", paths.voice.startsWith("http") ? paths.voice : `${base}/api/twilio/voice-answer`],
    ["Twilio recording status", `${base}/api/twilio/voice-status`],
    ["Zernio message.received", `${base}/api/zernio/webhook`],
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Webhook URLs</p>
      {rows.map(([label, url]) => (
        <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#D9D3C7] bg-bg px-3 py-2">
          <div>
            <p className="text-xs uppercase text-muted">{label}</p>
            <p className="break-all text-sm">{url}</p>
          </div>
          <button type="button" className="text-sm font-medium text-primary" onClick={() => copy(url)}>Copy</button>
        </div>
      ))}
    </div>
  );
}

function TemplateManager({
  templates,
  confirm,
  onChange,
  onError,
}: {
  templates: Template[];
  confirm: ReturnType<typeof useConfirm>;
  onChange: (next: Template[]) => void;
  onError: (message: string | null) => void;
}) {
  const [channel, setChannel] = useState("whatsapp");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [body, setBody] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3 rounded-card bg-white p-5 shadow-soft">
      <h3 className="font-display text-2xl">Message templates</h3>
      <p className="text-sm text-muted">WhatsApp can only send an approved template after 24 hours. For WhatsApp, the template name must be the Twilio Content SID (it starts with HX). For Messenger and Instagram, use the approved template name Zernio expects.</p>
      <ul className="space-y-2">
        {templates.map((template) => (
          <li key={template.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-[#D9D3C7] px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{template.channel} · {template.name} · {template.language} {template.approved ? "· approved" : "· draft"}</p>
              <p className="text-muted">{template.body}</p>
            </div>
            <button type="button" className="text-danger" onClick={() => confirm.ask("Delete this template?", "Replies that need it will fail until you add it again.", async () => {
              onChange(await deleteTemplateFn({ data: { id: template.id } }));
            })}>Delete</button>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectInput value={channel} onChange={(event) => setChannel(event.target.value)}>
          {["whatsapp", "sms", "messenger", "instagram", "email"].map((item) => <option key={item}>{item}</option>)}
        </SelectInput>
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Template name" />
        <TextInput value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Language, such as en" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> Approved by the platform</label>
      </div>
      <TextArea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Template body the team and the assistant can send" />
      <Button loading={busy} loadingLabel="Saving..." onClick={() => {
        setBusy(true);
        onError(null);
        saveTemplateFn({ data: { channel, name, language, body, approved } })
          .then(onChange)
          .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : "Could not save the template."))
          .finally(() => setBusy(false));
      }}>Save template</Button>
    </section>
  );
}
