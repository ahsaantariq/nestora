import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteFaqFn, listFaqsAdminFn, reorderFaqsFn, saveFaqFn } from "@/lib/nestora/content.fns";
import { PageIntro } from "@/components/workspace";
import { SelectField, TextAreaField, TextField, ToggleField, useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/faqs")({ component: FaqsAdmin });

type Faq = Awaited<ReturnType<typeof listFaqsAdminFn>>[number];

function FaqsAdmin() {
  const [rows, setRows] = useState<Faq[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Faq> | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  function reload() {
    return listFaqsAdminFn().then(setRows);
  }
  useEffect(() => {
    reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load questions."));
  }, []);

  const grouped = ["GUESTS", "OWNERS", "PAYMENTS"] as const;

  return (
    <>
      {confirm.dialog}
      <PageIntro title="FAQs" body="Questions on the public FAQ page, the home page, and the host page." />
      <Button type="button" onClick={() => setEditing({ category: "GUESTS", question: "", answer: "", published: true })}>Add question</Button>
      {editing ? (
        <form className="mt-4 max-w-xl space-y-3 rounded-card bg-white p-4 shadow-soft" onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          saveFaqFn({ data: { id: editing.id, category: (editing.category ?? "GUESTS") as "GUESTS" | "OWNERS" | "PAYMENTS", question: editing.question ?? "", answer: editing.answer ?? "", published: Boolean(editing.published) } })
            .then(() => { toast.success("Question saved"); setEditing(null); return reload(); })
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not save."))
            .finally(() => setSaving(false));
        }}>
          <SelectField label="Category" value={editing.category ?? "GUESTS"} onChange={(category) => setEditing({ ...editing, category })} options={[{ value: "GUESTS", label: "Guests" }, { value: "OWNERS", label: "Owners" }, { value: "PAYMENTS", label: "Payments" }]} />
          <TextField label="Question" value={editing.question ?? ""} onChange={(question) => setEditing({ ...editing, question })} />
          <TextAreaField label="Answer" value={editing.answer ?? ""} maxLength={4000} onChange={(answer) => setEditing({ ...editing, answer })} />
          <ToggleField label="Published" checked={Boolean(editing.published)} onChange={(published) => setEditing({ ...editing, published })} />
          <Button type="submit" loading={saving} loadingLabel="Saving...">Save question</Button>
        </form>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {!rows && !error ? <Skeleton className="mt-4 h-24" /> : null}
      {rows && rows.length === 0 ? <EmptyState title="No questions" body="Add the first one." /> : null}
      {grouped.map((category) => {
        const items = rows?.filter((row) => row.category === category) ?? [];
        if (!rows || items.length === 0) return null;
        return (
          <section key={category} className="mt-8">
            <h2 className="font-display text-2xl">{category === "OWNERS" ? "Owners" : category === "PAYMENTS" ? "Payments" : "Guests"}</h2>
            <ul className="mt-3 space-y-2">
              {items.map((row, index) => (
                <li key={row.id} className="rounded-card bg-surface p-4 shadow-soft">
                  <p className="font-medium">{row.question}</p>
                  <p className="mt-1 text-sm text-muted">{row.answer}</p>
                  <p className="mt-1 text-xs text-muted">{row.published ? "Published" : "Hidden"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="quiet" onClick={() => setEditing(row)}>Edit</Button>
                    <Button variant="quiet" disabled={index === 0} onClick={() => {
                      const ids = items.map((item) => item.id);
                      const swap = ids[index - 1];
                      if (!swap) return;
                      ids[index - 1] = row.id;
                      ids[index] = swap;
                      const others = (rows ?? []).filter((item) => item.category !== category).map((item) => item.id);
                      void reorderFaqsFn({ data: { ids: [...others, ...ids] } }).then(setRows);
                    }}>Up</Button>
                    <Button variant="quiet" disabled={index === items.length - 1} onClick={() => {
                      const ids = items.map((item) => item.id);
                      const swap = ids[index + 1];
                      if (!swap) return;
                      ids[index + 1] = row.id;
                      ids[index] = swap;
                      const others = (rows ?? []).filter((item) => item.category !== category).map((item) => item.id);
                      void reorderFaqsFn({ data: { ids: [...others, ...ids] } }).then(setRows);
                    }}>Down</Button>
                    <Button variant="danger" onClick={() => confirm.ask("Delete this question?", "It leaves the public FAQ page.", async () => {
                      await deleteFaqFn({ data: { id: row.id } });
                      await reload();
                    })}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
