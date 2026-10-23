import { useEffect, useState } from "react";
import { loadPublicPageFn } from "@/lib/nestora/content.fns";
import { PublicFrame } from "@/components/site-chrome";
import { NotFound } from "@/components/not-found";
import { Skeleton } from "@/components/ui";

export function CmsPage({ slug }: { slug: string }) {
  const [page, setPage] = useState<Awaited<ReturnType<typeof loadPublicPageFn>> | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadPublicPageFn({ data: { slug } })
      .then((next) => { if (!cancelled) setPage(next); })
      .catch(() => { if (!cancelled) setPage(null); });
    return () => { cancelled = true; };
  }, [slug]);
  if (page === undefined) {
    return (
      <PublicFrame>
        <div className="mx-auto max-w-3xl px-4 py-16"><Skeleton className="h-40" /></div>
      </PublicFrame>
    );
  }
  if (!page) return <NotFound />;
  return (
    <PublicFrame>
      <article className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="font-display text-5xl">{page.title}</h1>
        <div className="cms-body mt-8" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
      </article>
    </PublicFrame>
  );
}
