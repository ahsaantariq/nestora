import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PROPERTY_TYPES } from "@/lib/nestora/constants";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { claimVerificationFn, prepareSignupFn, publicFeesFn } from "@/lib/nestora/functions";
import { formatBps, formatMoney } from "@/lib/domain/money";
import { useProfile } from "@/components/profile-context";
import { PublicFrame } from "@/components/site-chrome";
import { AsyncForm, SelectField, TextField } from "@/components/forms";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/host/")({ component: HostLanding });

const faqs = [
  ["When does a listing go live?", "You can draft it right away. It appears in search after Nestora approves it."],
  ["What does it cost to list?", "The fees below are what guests and hosts see today. They can change, and you'll see the current numbers here."],
  ["Can I pause a live stay?", "Yes. A live property with bookings can be paused. It isn't deleted, so existing trips stay intact."],
  ["Do I need a separate login?", "No. The same email and password work for guests, hosts, and admins. You'll land in the right place after you sign in."],
];

function HostLanding() {
  const { user, isPending } = useCurrentUserState();
  const { profile, loading } = useProfile();
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof publicFeesFn>> | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [propertyType, setPropertyType] = useState("HOUSE");
  const [count, setCount] = useState("1");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ delivered: boolean; fallbackUrl: string | null } | null>(null);

  useEffect(() => {
    publicFeesFn().then(setSettings).catch(() => setSettings(null));
  }, []);

  if (!isPending && !loading && user && profile && (profile.role === "OWNER" || profile.role === "ADMIN") && !done) {
    return <Navigate to="/host/dashboard" />;
  }

  const commission = !settings
    ? "Loading fees…"
    : !settings.commissionEnabled
      ? "No commission"
      : settings.commissionType === "FIXED"
        ? formatMoney(settings.commissionFixedCents)
        : formatBps(settings.commissionBps);

  return (
    <PublicFrame>
      <section className="bg-primary text-surface">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="text-sm font-medium text-surface/80">For hosts</p>
          <h1 className="mt-2 max-w-xl font-display text-5xl">List your property.</h1>
          <p className="mt-4 max-w-lg text-surface/85">Hotels, houses, apartments, and warehouses. Draft a listing today. It goes live after a short review.</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-3">
        {[
          ["Tell us about the place", "Type, address, price, photos, and house rules. Save as many drafts as you need."],
          ["We review it", "A live listing is one Nestora has approved. You can keep editing a draft until then."],
          ["Welcome guests", "You keep the calendar, the messages, and the payout details in your host dashboard."],
        ].map(([title, body]) => (
          <article key={title}>
            <h2 className="font-display text-2xl">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </article>
        ))}
      </section>
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-14 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-card bg-white p-6 shadow-soft">
          <h2 className="font-display text-3xl">Fees today</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Commission</dt><dd>{commission}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Subscription</dt><dd>{settings ? (settings.subscriptionEnabled ? formatMoney(settings.subscriptionAmountCents) : "Off") : "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Guest service fee</dt><dd>{settings ? formatBps(settings.serviceFeeBps) : "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Tax</dt><dd>{settings ? formatBps(settings.taxBps) : "—"}</dd></div>
          </dl>
        </div>
        <div className="rounded-card bg-white p-6 shadow-soft">
          <h2 className="font-display text-3xl">Create a host account</h2>
          {done ? (
            <div className="mt-4 space-y-3 text-sm">
              <p>{done.delivered ? "Check your email. After you verify, you'll land in your host dashboard and can start a draft." : "Email isn't set up yet. Use this one-time link to verify your host account."}</p>
              {done.fallbackUrl ? <a className="block break-all font-medium text-primary" href={done.fallbackUrl}>Verify email</a> : null}
            </div>
          ) : (
            <AsyncForm className="mt-4 grid gap-4" onSubmit={async () => {
              setError(null);
              if (!terms) {
                setError("Agree to the host terms to continue.");
                return;
              }
              const prepared = await prepareSignupFn({
                data: {
                  email,
                  kind: "OWNER",
                  payload: { phone, businessName: business, country, city, propertyType, propertyCount: Number(count) || 1, name },
                },
              });
              const result = await authClient.signUp.email({
                name: name.trim(),
                email: email.trim(),
                password,
                callbackURL: "/host/dashboard",
              });
              if (result.error) {
                setError(result.error.message ?? "Could not create that account.");
                return;
              }
              await authClient.signOut();
              const delivery = await claimVerificationFn({ data: { email, nonce: prepared.nonce } });
              setDone(delivery);
            }}>
              {(busy) => (
                <>
                  <TextField label="Full name" required value={name} onChange={setName} />
                  <TextField label="Email" type="email" required value={email} onChange={setEmail} />
                  <TextField label="Phone" required value={phone} onChange={setPhone} />
                  <TextField label="Password" type="password" required value={password} onChange={setPassword} />
                  <TextField label="Business or property name" required value={business} onChange={setBusiness} />
                  <TextField label="Country" required value={country} onChange={setCountry} />
                  <TextField label="City" required value={city} onChange={setCity} />
                  <SelectField label="Property type" value={propertyType} onChange={setPropertyType} options={PROPERTY_TYPES.map((type) => ({ value: type.id, label: type.label }))} />
                  <TextField label="How many properties" value={count} onChange={setCount} />
                  <label className="flex items-start gap-2 text-sm md:col-span-2">
                    <input type="checkbox" className="mt-1 accent-primary" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
                    I agree to list accurate information and follow Nestora's host terms.
                  </label>
                  {error ? <p className="text-sm text-danger md:col-span-2">{error}</p> : null}
                  <Button type="submit" loading={busy} loadingLabel="Creating...">Create host account</Button>
                  <p className="text-sm text-muted">Already hosting? <Link to="/login" className="font-medium text-primary">Sign in</Link></p>
                </>
              )}
            </AsyncForm>
          )}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="font-display text-3xl">Questions</h2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {faqs.map(([question, answer]) => (
            <div key={question} className="border-t border-line pt-4">
              <dt className="font-medium">{question}</dt>
              <dd className="mt-2 text-sm text-muted">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </PublicFrame>
  );
}
