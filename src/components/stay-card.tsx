import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatMoney } from "@/lib/domain/money";
import type { StayCard } from "@/lib/nestora/data.server";
import { GalleryLightbox } from "@/components/gallery";

function itemsFor(stay: StayCard) {
  const urls = stay.photos.length > 0 ? stay.photos : stay.coverUrl ? [stay.coverUrl] : [];
  return urls.map((url, index) => ({ id: `${stay.id}-${index}`, url, kind: "IMAGE" }));
}

export function StayCardView({ stay, layout = "grid" }: { stay: StayCard; layout?: "grid" | "row" }) {
  const [open, setOpen] = useState<number | null>(null);
  const items = itemsFor(stay);
  const extra = stay.photoCount > 1 ? stay.photoCount - 1 : 0;
  const photo = items[0] ? (
    <button
      type="button"
      className={layout === "row" ? "relative h-24 w-32 shrink-0" : "relative block w-full"}
      onClick={() => setOpen(0)}
    >
      <img
        src={items[0].url}
        alt=""
        className={layout === "row" ? "h-24 w-32 rounded-[10px] object-cover" : "h-44 w-full object-cover"}
        loading="lazy"
        sizes={layout === "row" ? "128px" : "(min-width: 1024px) 360px, 100vw"}
      />
      {extra > 0 ? (
        <span className="absolute bottom-2 right-2 rounded-[8px] bg-ink/70 px-2 py-1 text-xs text-white">+{extra} more</span>
      ) : null}
    </button>
  ) : (
    <div className={layout === "row" ? "h-24 w-32 shrink-0 rounded-[10px] bg-primary/10" : "h-44 bg-primary/10"} />
  );

  return (
    <article className={layout === "row" ? "flex gap-4 rounded-card bg-surface p-4 shadow-soft" : "overflow-hidden rounded-card bg-surface shadow-soft"}>
      {photo}
      <div className={layout === "row" ? "min-w-0 flex-1" : "p-5"}>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{stay.propertyType.toLowerCase()}</p>
        <h3 className="mt-1 font-display text-2xl">
          <Link to="/stay/$slug" params={{ slug: stay.slug }} className="hover:text-primary">{stay.title}</Link>
        </h3>
        <p className="mt-1 text-sm text-muted">{[stay.city, stay.region, stay.country].filter(Boolean).join(", ") || "Location on the stay page"}</p>
        {stay.reviewCount > 0 ? (
          <p className="mt-2 text-sm">{stay.avgRating.toFixed(1)} · {stay.reviewCount} {stay.reviewCount === 1 ? "review" : "reviews"}</p>
        ) : null}
        <p className="mt-3 text-sm font-medium tabular-nums">{formatMoney(stay.nightlyCents)} / night</p>
      </div>
      {open != null ? <GalleryLightbox items={items} index={open} title={stay.title} onClose={() => setOpen(null)} onIndex={setOpen} /> : null}
    </article>
  );
}
