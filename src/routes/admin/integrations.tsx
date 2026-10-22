import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadIntegrationsFn, saveIntegrationsFn, sendTestEmailFn, testStripeFn } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { AsyncForm, SelectField, TextField, ToggleField } from "@/components/forms";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/integrations")({ component: IntegrationsPage });

type View = Awaited<ReturnType<typeof loadIntegrationsFn>>;

function IntegrationsPage() {
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadIntegrationsFn()
      .then(setData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load settings."));
  }, []);

  if (error && !data) return <EmptyState title="Settings didn't load" body={error} />;
  if (!data) return <Skeleton className="h-40" />;

  return (
    <>
      <PageIntro title="Integrations" body="Stripe and email are read from here first. Saved secrets stay on the server and are shown only as a hint." />
      {!data.smtpConfigured ? (
        <p className="mb-4 rounded-[10px] border border-accent/40 bg-accent/10 px-4 py-3 text-sm">Email is not configured. Verification and booking mail will stay in the email log until SMTP is saved here or set in the host environment.</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm text-primary">{notice}</p> : null}
      <IntegrationForm initial={data} onSaved={setData} onError={setError} onNotice={setNotice} />
    </>
  );
}

function IntegrationForm({
  initial,
  onSaved,
  onError,
  onNotice,
}: {
  initial: View;
  onSaved: (next: View) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}) {
  const [publishable, setPublishable] = useState(initial.stripePublishableKey);
  const [secret, setSecret] = useState("");
  const [webhook, setWebhook] = useState("");
  const [live, setLive] = useState(initial.stripeLive);
  const [host, setHost] = useState(initial.smtpHost);
  const [port, setPort] = useState(initial.smtpPort);
  const [security, setSecurity] = useState(initial.smtpSecurity);
  const [username, setUsername] = useState(initial.smtpUsername);
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState(initial.smtpFromName);
  const [fromEmail, setFromEmail] = useState(initial.smtpFromEmail);
  const [require2fa, setRequire2fa] = useState(initial.requireOwner2fa);
  const [replaceSecret, setReplaceSecret] = useState(!initial.stripeSecretHint);
  const [replaceWebhook, setReplaceWebhook] = useState(!initial.stripeWebhookHint);
  const [replacePassword, setReplacePassword] = useState(!initial.smtpPasswordHint);
  const [testing, setTesting] = useState<"stripe" | "mail" | null>(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <AsyncForm
      className="space-y-6"
      onSubmit={async () => {
        onError(null);
        onNotice(null);
        const next = await saveIntegrationsFn({
          data: {
            stripePublishableKey: publishable,
            stripeSecret: replaceSecret ? secret : "",
            stripeWebhookSecret: replaceWebhook ? webhook : "",
            stripeLive: live,
            clearStripeSecret: false,
            clearStripeWebhook: false,
            smtpHost: host,
            smtpPort: port,
            smtpSecurity: security,
            smtpUsername: username,
            smtpPassword: replacePassword ? password : "",
            clearSmtpPassword: false,
            smtpFromName: fromName,
            smtpFromEmail: fromEmail,
            requireOwner2fa: require2fa,
          },
        });
        onSaved(next);
        setSecret("");
        setWebhook("");
        setPassword("");
        setReplaceSecret(false);
        setReplaceWebhook(false);
        setReplacePassword(false);
        onNotice("Saved. New keys are used on the next payment or email.");
      }}
    >
      {(busy) => (
        <>
          <section className="space-y-4 rounded-card bg-white p-5 shadow-soft">
            <h2 className="font-display text-2xl">Stripe</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Publishable key" value={publishable} onChange={setPublishable} hint="Safe to show in the browser." />
              <ToggleField label="Live mode" checked={live} hint={live ? "Live charges." : "Test charges."} onChange={setLive} />
              {replaceSecret ? (
                <TextField label="Secret key" type="password" value={secret} onChange={setSecret} hint={initial.stripeSecretHint ? `Replaces ${initial.stripeSecretHint}` : "Not saved yet."} />
              ) : (
                <SecretRow label="Secret key" hint={initial.stripeSecretHint} onReplace={() => setReplaceSecret(true)} />
              )}
              {replaceWebhook ? (
                <TextField label="Webhook signing secret" type="password" value={webhook} onChange={setWebhook} hint={initial.stripeWebhookHint ? `Replaces ${initial.stripeWebhookHint}` : "Not saved yet."} />
              ) : (
                <SecretRow label="Webhook signing secret" hint={initial.stripeWebhookHint} onReplace={() => setReplaceWebhook(true)} />
              )}
            </div>
            <p className="text-sm text-muted">Webhook URL</p>
            <p className="break-all rounded-[10px] border border-[#D9D3C7] bg-bg px-3 py-3 text-sm">{origin}{initial.webhookPath}</p>
            <Button type="button" variant="quiet" loading={testing === "stripe"} loadingLabel="Testing..." onClick={() => {
              setTesting("stripe");
              onError(null);
              testStripeFn()
                .then((result) => onNotice(`Stripe accepted the key (${result.mode}).`))
                .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : "Stripe test failed."))
                .finally(() => setTesting(null));
            }}>Test connection</Button>
          </section>
          <section className="space-y-4 rounded-card bg-white p-5 shadow-soft">
            <h2 className="font-display text-2xl">Email</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="SMTP host" value={host} onChange={setHost} />
              <TextField label="Port" value={port} onChange={setPort} />
              <SelectField label="Security" value={security} onChange={(value) => setSecurity(value as View["smtpSecurity"])} options={[{ value: "TLS", label: "TLS" }, { value: "SSL", label: "SSL" }, { value: "NONE", label: "None" }]} />
              <TextField label="Username" value={username} onChange={setUsername} />
              {replacePassword ? (
                <TextField label="Password" type="password" value={password} onChange={setPassword} hint={initial.smtpPasswordHint ? `Replaces ${initial.smtpPasswordHint}` : "Not saved yet."} />
              ) : (
                <SecretRow label="Password" hint={initial.smtpPasswordHint} onReplace={() => setReplacePassword(true)} />
              )}
              <TextField label="From name" value={fromName} onChange={setFromName} />
              <TextField label="From email" value={fromEmail} onChange={setFromEmail} />
            </div>
            <Button type="button" variant="quiet" loading={testing === "mail"} loadingLabel="Sending..." onClick={() => {
              setTesting("mail");
              onError(null);
              sendTestEmailFn()
                .then((result) => onNotice(`Test email queued for ${result.to}.`))
                .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : "Test email failed."))
                .finally(() => setTesting(null));
            }}>Send test email</Button>
          </section>
          <section className="rounded-card bg-white p-5 shadow-soft">
            <ToggleField label="Require two-factor for hosts" checked={require2fa} hint="Hosts must set up an authenticator before opening their dashboard." onChange={setRequire2fa} />
          </section>
          <Button type="submit" loading={busy} loadingLabel="Saving...">Save integrations</Button>
        </>
      )}
    </AsyncForm>
  );
}

function SecretRow({ label, hint, onReplace }: { label: string; hint: string | null; onReplace: () => void }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1.5 flex h-11 items-center justify-between rounded-[10px] border border-[#D9D3C7] bg-white px-3.5">
        <span className="text-sm text-muted">{hint ?? "Not saved"}</span>
        <button type="button" className="text-sm font-medium text-primary" onClick={onReplace}>Replace</button>
      </div>
    </div>
  );
}
