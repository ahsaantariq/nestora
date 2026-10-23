import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPageFn, deletePageFn, listPagesFn } from "@/lib/nestora/content.fns";
import { pagePath } from "@/lib/nestora/pages";
import { PageIntro } from "@/components/workspace";
import { TextField, useConfirm } from "@/components/forms";
import { Button, EmptyState, Skeleton, StatusPill } from "@/components/ui";

export const Route = createFileRoute("/admin/pages/")({ component: PagesAdmin });

function PagesAdmin() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPagesFn>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();

  function reload() {
    return listPagesFn().then(setRows);
  }
  useEffect(() => {
    reload().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load pages."));
  }, []);

  return (
    <>
      {confirm.dialog}
      <PageIntro title="Pages" body="Edit the public pages. Built-in pages can be unpublished. Extra pages can be deleted." />
      {error ? <EmptyState title="Pages didn't load" body={error} /> : null}
      {!rows && !error ? <Skeleton className="h-24" /> : null}
      <ul className="space-y-3">
        {rows?.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
            <div>
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-muted">{pagePath(row.slug)} · edited {row.updated_at.slice(0, 16).replace("T", " ")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={row.status === "PUBLISHED" ? "ok" : "muted"}>{row.status.toLowerCase()}</StatusPill>
              <Link to="/admin/pages/$pageId" params={{ pageId: row.id }} className="inline-flex h-11 items-center rounded-[10px] bg-primary px-4 text-sm font-medium text-surface">Edit</Link>
              <a href={pagePath(row.slug)} className="inline-flex h-11 items-center rounded-[10px] border border-line bg-white px-4 text-sm">View</a>
              <Button variant="danger" onClick={() => confirm.ask("Delete this page?", "Built-in pages cannot be deleted.", async () => {
                await deletePageFn({ data: { id: row.id } });
                await reload();
              })}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
      <form className="mt-8 max-w-xl space-y-3 rounded-card bg-white p-5 shadow-soft" onSubmit={(event) => {
        event.preventDefault();
        setCreating(true);
        setError(null);
        createPageFn({ data: { title, slug } })
          .then((created) => navigate({ to: "/admin/pages/$pageId", params: { pageId: created.id } }))
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not add the page."))
          .finally(() => setCreating(false));
      }}>
        <h2 className="font-display text-2xl">Add a page</h2>
        <TextField label="Title" value={title} onChange={setTitle} required />
        <TextField label="URL slug" value={slug} onChange={setSlug} hint="Lowercase, for example house-rules. The public address will be /p/your-slug." required />
        <Button type="submit" loading={creating} loadingLabel="Creating...">Add new page</Button>
      </form>
    </>
  );
}
