import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadPublicChromeFn, loadPublicPageFn, submitContactFn } from "@/lib/nestora/content.fns";
import { PublicFrame } from "@/components/site-chrome";
import { SelectField, TextAreaField, TextField } from "@/components/forms";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/contact")({ component: ContactPage });

const SUBJECTS = ["Booking", "Listing", "Payments", "Account", "Something else"] as const;

function ContactPage() {
  const [intro, setIntro] = useState("");
  const [contact, setContact] = useState<{ email: string; phone: string; address: string; hours: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>("Booking");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadPublicPageFn({ data: { slug: "contact" } }).then((page) => setIntro(page?.bodyHtml ?? "")).catch(() => setIntro(""));
    loadPublicChromeFn().then((next) => setContact(next.contact)).catch(() => setContact(null));
  }, []);

  return (
    <PublicFrame>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h1 className="font-display text-5xl">Contact</h1>
          {intro ? <div className="cms-body mt-4" dangerouslySetInnerHTML={{ __html: intro }} /> : <p className="mt-4 text-sm text-muted">Send a note about a booking, a listing, or your account.</p>}
          <dl className="mt-6 space-y-3 text-sm">
            {contact?.email ? <div><dt className="text-muted">Email</dt><dd>{contact.email}</dd></div> : null}
            {contact?.phone ? <div><dt className="text-muted">Phone</dt><dd>{contact.phone}</dd></div> : null}
            {contact?.address ? <div><dt className="text-muted">Address</dt><dd>{contact.address}</dd></div> : null}
            {contact?.hours ? <div><dt className="text-muted">Hours</dt><dd>{contact.hours}</dd></div> : null}
          </dl>
        </div>
        {done ? (
          <p className="rounded-card bg-surface p-6 shadow-soft">Thanks. We have your message and will reply by email.</p>
        ) : (
          <form className="relative space-y-4 rounded-card bg-surface p-6 shadow-soft" onSubmit={(event) => {
            event.preventDefault();
            setSending(true);
            setError(null);
            submitContactFn({ data: { name, email, phone, subject, message, companyWebsite: website } })
              .then(() => setDone(true))
              .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not send that."))
              .finally(() => setSending(false));
          }}>
            <TextField label="Name" value={name} onChange={setName} required />
            <TextField label="Email" type="email" value={email} onChange={setEmail} required />
            <TextField label="Phone" value={phone} onChange={setPhone} />
            <SelectField label="Subject" value={subject} onChange={(value) => setSubject(value as (typeof SUBJECTS)[number])} options={SUBJECTS.map((item) => ({ value: item, label: item }))} />
            <TextAreaField label="Message" value={message} maxLength={4000} onChange={setMessage} />
            <label className="absolute left-[-9999px]" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" loading={sending} loadingLabel="Sending...">Send message</Button>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}
