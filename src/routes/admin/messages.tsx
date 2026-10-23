import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteMessageFn, listMessagesFn, listSubscribersFn, replyMessageFn, setMessageStatusFn } from "@/lib/nestora/content.fns";
import { PageIntro } from "@/components/workspace";
import { SelectField, TextAreaField, TextField, useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/messages")({ component: MessagesPage });

type Row = Awaited<ReturnType<typeof listMessagesFn>>[number];

function MessagesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [subs, setSubs] = useState<Awaited<ReturnType<typeof listSubscribersFn>> | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();

  function load(next = { q, status }) {
    return listMessagesFn({ data: next }).then(setRows);
  }
  useEffect(() => {
    load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load messages."));
    listSubscribersFn().then(setSubs).catch(() => setSubs([]));
  }, []);

  return (
    <>
      {confirm.dialog}
      <PageIntro title="Messages" body="Notes from the contact form, and emails saved from the home page." />
      <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Search failed.")); }}>
        <TextField label="Search" value={q} onChange={setQ} />
        <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "UNREAD", label: "Unread" }, { value: "READ", label: "Read" }, { value: "ARCHIVED", label: "Archived" }]} />
        <div className="self-end"><Button type="submit">Filter</Button></div>
      </form>
      {error ? <EmptyState title="Messages didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No messages" body="The inbox is empty for this filter." /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id}>
            <button type="button" className="w-full rounded-card bg-surface p-4 text-left shadow-soft" onClick={() => { setOpen(row); setReply(row.reply_text ?? ""); if (row.status === "UNREAD") void setMessageStatusFn({ data: { id: row.id, status: "READ" } }).then(() => load()); }}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{row.name} · {row.subject}</p>
                <StatusPill tone={row.status === "UNREAD" ? "warn" : "muted"}>{row.status.toLowerCase()}</StatusPill>
              </div>
              <p className="text-sm text-muted">{row.email} · {row.created_at.slice(0, 16).replace("T", " ")}</p>
            </button>
            {open?.id === row.id ? (
              <div className="mt-2 space-y-3 rounded-card border border-line bg-white p-4">
                <p className="whitespace-pre-wrap text-sm">{row.body}</p>
                {row.phone ? <p className="text-sm text-muted">{row.phone}</p> : null}
                <TextAreaField label="Reply by email" value={reply} maxLength={4000} onChange={setReply} />
                <div className="flex flex-wrap gap-2">
                  <Button loading={busy === "reply"} loadingLabel="Sending..." onClick={() => {
                    setBusy("reply");
                    replyMessageFn({ data: { id: row.id, reply } })
                      .then(() => { toast.success("Reply queued"); return load(); })
                      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not send."))
                      .finally(() => setBusy(null));
                  }}>Send reply</Button>
                  <Button variant="quiet" onClick={() => void setMessageStatusFn({ data: { id: row.id, status: "UNREAD" } }).then(() => load())}>Mark unread</Button>
                  <Button variant="quiet" onClick={() => void setMessageStatusFn({ data: { id: row.id, status: "ARCHIVED" } }).then(() => load())}>Archive</Button>
                  <Button variant="danger" onClick={() => confirm.ask("Delete this message?", "This cannot be undone.", async () => {
                    await deleteMessageFn({ data: { id: row.id } });
                    setOpen(null);
                    await load();
                  })}>Delete</Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <h2 className="mb-3 mt-10 font-display text-2xl">Newsletter</h2>
      {subs && subs.length === 0 ? <p className="text-sm text-muted">No one has subscribed yet.</p> : null}
      <ul className="space-y-2">
        {subs?.map((row) => <li key={row.email} className="text-sm">{row.email} · {row.created_at.slice(0, 10)}</li>)}
      </ul>
    </>
  );
}
