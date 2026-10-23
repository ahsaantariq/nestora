import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadPageAdminFn, restorePageFn, savePageFn } from "@/lib/nestora/content.fns";
import { pagePath } from "@/lib/nestora/pages";
import { PageIntro } from "@/components/workspace";
import { SelectField, TextAreaField, TextField, useConfirm } from "@/components/forms";
import { RichTextEditor } from "@/components/rich-text";
import { Button, EmptyState, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/pages/$pageId")({ component: PageEditor });

type Page = Awaited<ReturnType<typeof loadPageAdminFn>>;

function PageEditor() {
  const { pageId } = Route.useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [ready, setReady] = useState(false);
  const [rev, setRev] = useState(0);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;
    loadPageAdminFn({ data: { id: pageId } })
      .then((next) => {
        if (cancelled) return;
        setPage(next);
        setTitle(next.title);
        setSeoTitle(next.seoTitle);
        setSeoDescription(next.seoDescription);
        setBody(next.bodyHtml);
        setStatus(next.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT");
        setReady(true);
      })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open this page."); });
    return () => { cancelled = true; };
  }, [pageId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await savePageFn({ data: { id: pageId, title, seoTitle, seoDescription, bodyHtml: body, status } });
      setPage(next);
      toast.success(status === "PUBLISHED" ? "Page published" : "Draft saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !page) return <EmptyState title="Page didn't open" body={error} />;
  if (!ready || !page) return <Skeleton className="h-40" />;

  return (
    <>
      {confirm.dialog}
      <PageIntro title={title || "Untitled page"} body={pagePath(page.slug)} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" loading={saving} loadingLabel="Saving..." onClick={() => void save()}>Save</Button>
        <Button type="button" variant="quiet" onClick={() => setPreview((value) => !value)}>{preview ? "Hide preview" : "Preview"}</Button>
        <a href={pagePath(page.slug)} className="inline-flex h-11 items-center rounded-[10px] border border-line bg-white px-4 text-sm">View</a>
      </div>
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <div className={preview ? "grid gap-6 lg:grid-cols-2" : "max-w-3xl space-y-4"}>
        <div className="space-y-4">
          <TextField label="Title" value={title} onChange={setTitle} />
          <TextField label="SEO title" value={seoTitle} onChange={setSeoTitle} />
          <TextAreaField label="SEO description" value={seoDescription} maxLength={300} onChange={setSeoDescription} />
          <SelectField label="Status" value={status} onChange={(value) => setStatus(value === "PUBLISHED" ? "PUBLISHED" : "DRAFT")} options={[{ value: "DRAFT", label: "Draft" }, { value: "PUBLISHED", label: "Published" }]} />
          <RichTextEditor key={`${page.id}-${rev}`} value={body} onChange={setBody} />
          <section className="rounded-card bg-surface p-4 shadow-soft">
            <h2 className="font-display text-xl">Recent versions</h2>
            {page.versions.length === 0 ? <p className="mt-2 text-sm text-muted">Versions appear after you save.</p> : null}
            <ul className="mt-3 space-y-2">
              {page.versions.map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{version.created_at.slice(0, 16).replace("T", " ")} · {version.title}</span>
                  <Button variant="quiet" onClick={() => confirm.ask("Restore this version?", "The current text is replaced. Save again if you want to keep it.", async () => {
                    const next = await restorePageFn({ data: { versionId: version.id } });
                    setPage(next);
                    setTitle(next.title);
                    setSeoTitle(next.seoTitle);
                    setSeoDescription(next.seoDescription);
                    setBody(next.bodyHtml);
                    setRev((value) => value + 1);
                    toast.success("Version restored");
                  }, "Restore")}>Restore</Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {preview ? (
          <article className="rounded-card bg-white p-5 shadow-soft">
            <h2 className="font-display text-4xl">{title}</h2>
            <div className="cms-body mt-4" dangerouslySetInnerHTML={{ __html: body }} />
          </article>
        ) : null}
      </div>
    </>
  );
}
