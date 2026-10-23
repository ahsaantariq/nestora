import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadPublicFaqsFn } from "@/lib/nestora/content.fns";
import { PublicFrame } from "@/components/site-chrome";
import { Skeleton } from "@/components/ui";

export const Route = createFileRoute("/faqs")({ component: FaqPage });

const labels: Record<string, string> = { GUESTS: "Guests", OWNERS: "Owners", PAYMENTS: "Payments" };

function FaqPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadPublicFaqsFn>> | null>(null);
  useEffect(() => {
    loadPublicFaqsFn().then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <PublicFrame>
      <div className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="font-display text-5xl">FAQs</h1>
        <p className="mt-3 text-sm text-muted">Answers for guests, hosts, and payments.</p>
        {!rows ? <Skeleton className="mt-8 h-24" /> : null}
        {rows && rows.length === 0 ? <p className="mt-8 text-sm text-muted">Questions will show here once they are published.</p> : null}
        {["GUESTS", "OWNERS", "PAYMENTS"].map((category) => {
          const items = rows?.filter((row) => row.category === category) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category} className="mt-10">
              <h2 className="font-display text-3xl">{labels[category]}</h2>
              <div className="mt-3 divide-y divide-line">
                {items.map((item) => (
                  <details key={item.id} className="py-4">
                    <summary className="cursor-pointer font-medium">{item.question}</summary>
                    <p className="mt-2 text-sm text-muted">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PublicFrame>
  );
}
