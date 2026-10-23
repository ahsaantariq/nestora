import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";

export type GalleryItem = { id: string; url: string; kind: string };

export function PhotoGallery({ items, title }: { items: GalleryItem[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) {
    return <div className="mt-6 grid h-48 place-items-center rounded-card bg-surface text-sm text-muted">No photos yet</div>;
  }
  const preview = items.slice(0, 4);
  const extra = items.length - 4;
  return (
    <div className="mt-6">
      <button type="button" className="block w-full" onClick={() => setOpen(0)}>
        <GalleryMedia item={items[0]!} title={title} className="h-80 w-full rounded-card object-cover" eager />
      </button>
      {items.length > 1 ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {preview.map((item, index) => {
            const last = index === 3 && extra > 0;
            return (
              <button key={item.id} type="button" className="relative" onClick={() => setOpen(index)}>
                <GalleryMedia item={item} title="" className="h-20 w-full rounded-[10px] object-cover" />
                {last ? (
                  <span className="absolute inset-0 grid place-items-center rounded-[10px] bg-ink/55 text-sm font-medium text-white">
                    +{extra} more
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <button type="button" className="mt-3 text-sm font-medium text-primary" onClick={() => setOpen(0)}>
        Show all photos
      </button>
      {open != null ? <GalleryLightbox items={items} index={open} title={title} onClose={() => setOpen(null)} onIndex={setOpen} /> : null}
    </div>
  );
}

function GalleryMedia({ item, title, className, eager }: { item: GalleryItem; title: string; className: string; eager?: boolean }) {
  if (item.kind === "VIDEO") {
    return <video src={item.url} className={className} muted playsInline preload="metadata" />;
  }
  return <img src={item.url} alt={title} className={className} loading={eager ? "eager" : "lazy"} sizes="(min-width: 1024px) 720px, 100vw" />;
}

export function GalleryLightbox({
  items,
  index,
  title,
  onClose,
  onIndex,
}: {
  items: GalleryItem[];
  index: number;
  title: string;
  onClose: () => void;
  onIndex: (index: number) => void;
}) {
  const [zoom, setZoom] = useState(false);
  const item = items[index];
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);
  useEffect(() => { setZoom(false); }, [index]);
  if (!item) return null;
  let startX = 0;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/92 text-white" role="dialog" aria-modal="true" aria-label={`${title} photos`}>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm tabular-nums">{index + 1} / {items.length}</p>
        <div className="flex gap-2">
          <button type="button" className="grid size-11 place-items-center" aria-label={zoom ? "Zoom out" : "Zoom in"} onClick={() => setZoom((value) => !value)}>
            <ZoomIn className="size-5" />
          </button>
          <button type="button" className="grid size-11 place-items-center" aria-label="Close photos" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-14"
        onTouchStart={(event) => { startX = event.changedTouches[0]?.clientX ?? 0; }}
        onTouchEnd={(event) => {
          const delta = (event.changedTouches[0]?.clientX ?? 0) - startX;
          if (delta > 40) onIndex((index - 1 + items.length) % items.length);
          if (delta < -40) onIndex((index + 1) % items.length);
        }}
      >
        <button type="button" className="absolute left-2 grid size-11 place-items-center rounded-full bg-white/15" aria-label="Previous" onClick={() => onIndex((index - 1 + items.length) % items.length)}>
          <ChevronLeft />
        </button>
        {item.kind === "VIDEO" ? (
          <video src={item.url} controls autoPlay className="max-h-full max-w-full" />
        ) : (
          <img src={item.url} alt="" className={`max-h-full max-w-full object-contain transition-transform ${zoom ? "scale-150 cursor-zoom-out" : ""}`} />
        )}
        <button type="button" className="absolute right-2 grid size-11 place-items-center rounded-full bg-white/15" aria-label="Next" onClick={() => onIndex((index + 1) % items.length)}>
          <ChevronRight />
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {items.map((thumb, thumbIndex) => (
          <button key={thumb.id} type="button" className={`shrink-0 overflow-hidden rounded-[8px] ${thumbIndex === index ? "ring-2 ring-white" : "opacity-70"}`} onClick={() => onIndex(thumbIndex)}>
            <GalleryMedia item={thumb} title="" className="h-14 w-20 object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
