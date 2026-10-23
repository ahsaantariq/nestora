import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  adminReplyFn,
  assignConversationFn,
  browserTokenFn,
  deleteContactFn,
  listConversationsFn,
  loadThreadFn,
  manualBookFn,
  mergeContactsFn,
  noteConversationFn,
  placeCallFn,
  resendLinkFn,
  resolveConversationFn,
  setModeFn,
  unmergeContactsFn,
} from "@/lib/nestora/assistant.fns";
import { PageIntro } from "@/components/workspace";
import { useConfirm } from "@/components/forms";
import { Button, EmptyState, SelectInput, TextArea, TextInput } from "@/components/ui";

export const Route = createFileRoute("/admin/conversations")({ component: ConversationsPage });

type Row = Awaited<ReturnType<typeof listConversationsFn>>[number];
type Thread = Awaited<ReturnType<typeof loadThreadFn>>;

function ConversationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [booked, setBooked] = useState("");
  const [unread, setUnread] = useState(false);
  const [attention, setAttention] = useState(false);
  const [sinceDays, setSinceDays] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  function reload() {
    return listConversationsFn({ data: { q, channel, status, mode, unread, booked, sinceDays } })
      .then((next) => setRows(attention ? next.filter((row) => row.needs_attention) : next))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load conversations."));
  }

  useEffect(() => { void reload(); }, [q, channel, mode, status, booked, unread, attention, sinceDays]);
  useEffect(() => {
    if (!active) return;
    loadThreadFn({ data: { id: active } }).then(setThread).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not open that conversation."));
  }, [active]);
  useEffect(() => {
    const source = new EventSource("/api/assistant/events");
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as { type?: string; reason?: string };
      void reload();
      if (active) loadThreadFn({ data: { id: active } }).then(setThread).catch(() => undefined);
      if (data.type === "attention") {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          osc.frequency.value = 880;
          osc.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        } catch { /* autoplay */ }
      }
    };
    return () => source.close();
  }, [active]);

  const visible = rows;
  return (
    <>
      {confirm.dialog}
      <PageIntro title="Conversations" body="Every channel lands in one thread. Take over when the assistant should stop." />
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <div className="mb-3 flex flex-wrap gap-2">
        <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name, phone, email" className="max-w-xs" />
        <SelectInput value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="">All channels</option>
          {["web", "sms", "whatsapp", "voice", "email", "messenger", "instagram"].map((item) => <option key={item}>{item}</option>)}
        </SelectInput>
        <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Any status</option>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
        </SelectInput>
        <SelectInput value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="">AI and human</option>
          <option value="AI">AI</option>
          <option value="HUMAN">Human</option>
        </SelectInput>
        <SelectInput value={booked} onChange={(event) => setBooked(event.target.value)}>
          <option value="">Booked or not</option>
          <option value="yes">Booked</option>
          <option value="no">Not booked</option>
        </SelectInput>
        <SelectInput value={String(sinceDays)} onChange={(event) => setSinceDays(Number(event.target.value))}>
          <option value="0">Any date</option>
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </SelectInput>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unread} onChange={(event) => setUnread(event.target.checked)} /> Unread</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={attention} onChange={(event) => setAttention(event.target.checked)} /> Needs attention</label>
      </div>
      <div className="grid gap-3 lg:grid-cols-[260px_1fr_280px]">
        <ul className="max-h-[70vh] space-y-2 overflow-auto">
          {visible.length === 0 ? <EmptyState title="No conversations" body="Messages from the site, phone, and social accounts show up here." /> : null}
          {visible.map((row) => (
            <li key={row.id}>
              <button type="button" className={`w-full rounded-[10px] bg-white p-3 text-left shadow-soft ${active === row.id ? "ring-2 ring-primary" : ""}`} onClick={() => setActive(row.id)}>
                <span className="flex items-center justify-between gap-2 text-xs uppercase text-primary">
                  <span>{row.last_channel}</span>
                  {row.needs_attention ? <span className="text-accent">Needs attention</span> : null}
                </span>
                <span className="mt-1 block font-medium">{row.name || row.phone || row.email || "New contact"}</span>
                <span className="mt-1 block truncate text-sm text-muted">{row.last_preview}</span>
              </button>
            </li>
          ))}
        </ul>
        <ThreadPane thread={thread} onChange={() => { if (active) loadThreadFn({ data: { id: active } }).then(setThread); }} onError={setError} />
        <ContactPane thread={thread} confirm={confirm} onChange={() => { setActive(null); setThread(null); void reload(); }} onError={setError} />
      </div>
    </>
  );
}

function ThreadPane({ thread, onChange, onError }: { thread: Thread | null; onChange: () => void; onError: (message: string) => void }) {
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("web");
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (!thread) return <div className="rounded-card bg-white p-6 text-sm text-muted shadow-soft">Choose a conversation.</div>;
  const conversation = thread.conversation;
  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    try { await work(); onChange(); } catch (reason) { onError(reason instanceof Error ? reason.message : "That didn't work."); }
    finally { setBusy(null); }
  }
  return (
    <div className="flex max-h-[70vh] flex-col rounded-card bg-white shadow-soft">
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        <Button loading={busy === "take"} loadingLabel="Saving..." onClick={() => void run("take", () => setModeFn({ data: { id: conversation.id, mode: conversation.mode === "AI" ? "HUMAN" : "AI" } }))}>
          {conversation.mode === "AI" ? "Take over" : "Hand back to AI"}
        </Button>
        <Button variant="quiet" loading={busy === "done"} loadingLabel="Saving..." onClick={() => void run("done", () => resolveConversationFn({ data: { id: conversation.id, resolved: conversation.status !== "RESOLVED" } }))}>
          {conversation.status === "RESOLVED" ? "Reopen" : "Mark resolved"}
        </Button>
      </div>
      <ul className="flex-1 space-y-3 overflow-auto p-4">
        {thread.calls.map((call) => (
          <li key={call.id} className="rounded-[10px] bg-bg p-3">
            <p className="text-xs uppercase text-muted">call · {call.direction} · {call.duration_seconds}s · {call.outcome === "open" ? "not booked" : call.outcome.replace("_", " ")}</p>
            {call.recording_url ? <audio className="mt-2 w-full" controls src={call.recording_url} /> : <p className="mt-1 text-sm text-muted">No recording stored.</p>}
            {call.summary ? <p className="mt-2 text-sm">{call.summary}</p> : null}
            {call.transcript ? <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{call.transcript}</pre> : null}
          </li>
        ))}
        {thread.messages.map((message) => (
          <li key={message.id} className={message.sender === "CUSTOMER" ? "" : "pl-6"}>
            <p className="text-xs uppercase text-muted">{message.sender.toLowerCase()} · {message.channel} · {message.kind.toLowerCase()} · {message.status.toLowerCase()}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
            {message.url ? <a className="text-sm text-primary" href={message.url}>Payment link</a> : null}
          </li>
        ))}
      </ul>
      <form className="space-y-2 border-t border-line p-3" onSubmit={(event) => { event.preventDefault(); void run("send", async () => { await adminReplyFn({ data: { conversationId: conversation.id, channel: channel as "web", text, templateName: templateName || undefined } }); setText(""); }); }}>
        <SelectInput value={channel} onChange={(event) => setChannel(event.target.value)}>
          {["web", "sms", "whatsapp", "email", "messenger", "instagram"].map((item) => <option key={item}>{item}</option>)}
        </SelectInput>
        <TextInput value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Approved template name, if the 24-hour window is closed" />
        <TextArea value={text} onChange={(event) => setText(event.target.value)} placeholder="Reply in this channel" />
        <Button type="submit" loading={busy === "send"} loadingLabel="Sending...">Send</Button>
      </form>
    </div>
  );
}

function ContactPane({ thread, confirm, onChange, onError }: { thread: Thread | null; confirm: ReturnType<typeof useConfirm>; onChange: () => void; onError: (message: string) => void }) {
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dropId, setDropId] = useState("");
  const [callTo, setCallTo] = useState("");
  const [book, setBook] = useState({ slug: "", checkIn: "", checkOut: "", adults: "1", name: "", phone: "", email: "" });
  const [busy, setBusy] = useState<string | null>(null);
  if (!thread?.contact) return <div className="rounded-card bg-white p-4 text-sm text-muted shadow-soft">Contact details</div>;
  const contact = thread.contact;
  const identities = thread.identities;
  const bookings = thread.bookings;
  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    try { await work(); } catch (reason) { onError(reason instanceof Error ? reason.message : "That didn't work."); }
    finally { setBusy(null); }
  }
  return (
    <aside className="max-h-[70vh] space-y-3 overflow-auto rounded-card bg-white p-4 text-sm shadow-soft">
      <h2 className="font-display text-2xl">{contact.name || "Contact"}</h2>
      <p>{contact.phone || "No phone"}</p>
      <p>{contact.email || "No email"}</p>
      <p className="text-muted">{contact.user_id ? "Linked account" : "No account yet"} {contact.opted_out ? "· opted out" : ""}</p>
      <ul className="space-y-1 text-xs text-muted">{identities.map((item) => <li key={item.channel + item.external_id}>{item.channel}: {item.external_id}</li>)}</ul>
      <h3 className="font-medium">Bookings</h3>
      {bookings.map((booking) => (
        <p key={booking.id}>{booking.check_in} → {booking.check_out} · {booking.status.toLowerCase()}
          {booking.payment_url ? <button type="button" className="ml-2 text-primary" onClick={() => void run("link", () => resendLinkFn({ data: { conversationId: thread.conversation.id, bookingId: booking.id, channel: "web" } }))}>Resend link</button> : null}
        </p>
      ))}
      <TextInput value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Assign user id" />
      <Button variant="quiet" loading={busy === "assign"} loadingLabel="Saving..." onClick={() => void run("assign", () => assignConversationFn({ data: { id: thread.conversation.id, assignee } }))}>Assign</Button>
      <TextArea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal note" />
      <Button variant="quiet" loading={busy === "note"} loadingLabel="Saving..." onClick={() => void run("note", () => noteConversationFn({ data: { id: thread.conversation.id, body: note } }))}>Add note</Button>
      <TextInput value={callTo} onChange={(event) => setCallTo(event.target.value)} placeholder={contact.phone || "Phone to call"} />
      <Button variant="quiet" loading={busy === "call"} loadingLabel="Calling..." onClick={() => void run("call", () => placeCallFn({ data: { to: callTo || contact.phone || "" } }))}>Call with AI</Button>
      <Button variant="quiet" loading={busy === "browser"} loadingLabel="Connecting..." onClick={() => void run("browser", async () => {
        const { token } = await browserTokenFn();
        const { Device } = await import("@twilio/voice-sdk");
        const device = new Device(token);
        await device.register();
        await device.connect({ params: { To: callTo || contact.phone || "" } });
      })}>Call from this browser</Button>
      <TextInput value={dropId} onChange={(event) => setDropId(event.target.value)} placeholder="Contact id to merge in" />
      <Button variant="quiet" loading={busy === "merge"} loadingLabel="Merging..." onClick={() => void run("merge", () => mergeContactsFn({ data: { keepId: contact.id, dropId } }))}>Merge into this contact</Button>
      <Button variant="quiet" loading={busy === "unmerge"} loadingLabel="Restoring..." onClick={() => void run("unmerge", () => unmergeContactsFn({ data: { keepId: contact.id } }))}>Unmerge the last contact</Button>
      <Button variant="danger" onClick={() => confirm.ask("Delete this contact's conversations?", "Recordings, transcripts, and messages for this contact are removed. Bookings stay for the accounts.", async () => { await deleteContactFn({ data: { id: contact.id } }); onChange(); })}>Delete contact data</Button>
      <h3 className="font-medium">Book from this conversation</h3>
      {(["slug", "checkIn", "checkOut", "adults", "name", "phone", "email"] as const).map((field) => (
        <TextInput key={field} value={book[field]} placeholder={field} onChange={(event) => setBook((current) => ({ ...current, [field]: event.target.value }))} />
      ))}
      <Button loading={busy === "book"} loadingLabel="Holding..." onClick={() => void run("book", () => manualBookFn({ data: { conversationId: thread.conversation.id, slug: book.slug, checkIn: book.checkIn, checkOut: book.checkOut, adults: Number(book.adults) || 1, name: book.name, phone: book.phone, email: book.email, channel: "web" } }))}>Create hold and payment link</Button>
    </aside>
  );
}
