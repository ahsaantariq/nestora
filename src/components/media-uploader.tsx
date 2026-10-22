import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { getBearerToken } from "@/lib/auth/client";
import { Button } from "@/components/ui";

type Media = { id: string; kind: string; url: string; sortOrder: number; isCover: boolean };

const IMAGE_OK = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_OK = ["video/mp4", "video/quicktime", "video/webm"];

async function compressImage(file: File): Promise<File> {
  if (!IMAGE_OK.includes(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  bitmap.close();
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function MediaUploader({
  propertyId,
  media,
  onChange,
}: {
  propertyId: string;
  media: Media[];
  onChange: (next: Media[] | { error: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ name: string; percent: number; error?: string }[]>([]);
  const [orderBusy, setOrderBusy] = useState(false);

  async function upload(files: File[]) {
    const nextProgress = files.map((file) => ({ name: file.name, percent: 0 }));
    setProgress(nextProgress);
    for (let index = 0; index < files.length; index += 1) {
      const original = files[index]!;
      const isVideo = VIDEO_OK.includes(original.type) || /\.(mp4|mov|webm)$/i.test(original.name);
      const isImage = IMAGE_OK.includes(original.type) || /\.(jpe?g|png|webp)$/i.test(original.name);
      if (!isVideo && !isImage) {
        setProgress((current) => current.map((item, i) => (i === index ? { ...item, error: "Use JPG, PNG, WebP, MP4, MOV, or WebM." } : item)));
        continue;
      }
      if (isImage && original.size > 10 * 1024 * 1024) {
        setProgress((current) => current.map((item, i) => (i === index ? { ...item, error: "Images must be 10 MB or smaller." } : item)));
        continue;
      }
      if (isVideo && original.size > 200 * 1024 * 1024) {
        setProgress((current) => current.map((item, i) => (i === index ? { ...item, error: "Videos must be 200 MB or smaller." } : item)));
        continue;
      }
      const file = isImage ? await compressImage(original) : original;
      try {
        const listing = await send(propertyId, file, (percent) => {
          setProgress((current) => current.map((item, i) => (i === index ? { ...item, percent } : item)));
        });
        onChange(listing.media);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed.";
        setProgress((current) => current.map((item, i) => (i === index ? { ...item, error: message } : item)));
        onChange({ error: message });
      }
    }
  }

  async function reorder(ids: string[], coverId: string | null) {
    setOrderBusy(true);
    try {
      const { orderMediaFn } = await import("@/lib/nestora/functions");
      const next = await orderMediaFn({ data: { id: propertyId, ids, coverId } });
      onChange(next.media);
    } catch (error) {
      onChange({ error: error instanceof Error ? error.message : "Could not reorder photos." });
    } finally {
      setOrderBusy(false);
    }
  }

  return (
    <div className="md:col-span-2 space-y-4">
      <div
        className={`rounded-[10px] border border-dashed bg-white px-4 py-8 text-center ${dragOver ? "border-primary bg-primary/5" : "border-[#D9D3C7]"}`}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void upload(Array.from(event.dataTransfer.files));
        }}
      >
        <ImagePlus className="mx-auto size-6 text-primary" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium">Drop photos or a video here</p>
        <p className="mt-1 text-xs text-muted">JPG, PNG, WebP up to 10 MB. MP4, MOV, WebM up to 200 MB.</p>
        <Button type="button" variant="quiet" className="mt-4" onClick={() => inputRef.current?.click()}>Browse files</Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void upload(files);
          }}
        />
      </div>
      {progress.length > 0 ? (
        <ul className="space-y-2">
          {progress.map((item) => (
            <li key={item.name} className="text-xs">
              <div className="flex justify-between gap-3">
                <span className="truncate">{item.name}</span>
                <span className={item.error ? "text-danger" : "text-muted"}>{item.error ?? `${item.percent}%`}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-primary" style={{ width: `${item.error ? 100 : item.percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-3">
        {media.map((item, index) => (
          <li
            key={item.id}
            draggable
            onDragStart={(event) => event.dataTransfer.setData("text/plain", String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData("text/plain"));
              if (!Number.isInteger(from) || from === index) return;
              const ids = media.map((mediaItem) => mediaItem.id);
              const [moved] = ids.splice(from, 1);
              if (!moved) return;
              ids.splice(index, 0, moved);
              void reorder(ids, media.find((mediaItem) => mediaItem.isCover)?.id ?? null);
            }}
            className="overflow-hidden rounded-[10px] border border-[#D9D3C7] bg-white"
          >
            {item.kind === "VIDEO" ? (
              <video src={item.url} className="h-28 w-full object-cover" muted />
            ) : (
              <img src={item.url} alt="" className="h-28 w-full object-cover" />
            )}
            <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs">
              <span>{item.isCover ? "Cover" : item.kind === "VIDEO" ? "Video" : "Photo"}</span>
              <span className="flex gap-2">
                {item.kind === "IMAGE" ? (
                  <button type="button" className="text-primary" disabled={orderBusy} onClick={() => void reorder(media.map((mediaItem) => mediaItem.id), item.id)}>Cover</button>
                ) : null}
                <button
                  type="button"
                  className="text-danger"
                  onClick={() => {
                    void import("@/lib/nestora/functions").then(({ removeMediaFn }) =>
                      removeMediaFn({ data: { id: propertyId, mediaId: item.id } }).then((next) => onChange(next.media)),
                    );
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function send(propertyId: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<{ media: Media[] }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    const token = getBearerToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}") as { error?: string; media?: Media[] };
      if (xhr.status >= 200 && xhr.status < 300 && body.media) resolve({ media: body.media });
      else reject(new Error(body.error || "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    const form = new FormData();
    form.set("propertyId", propertyId);
    form.set("file", file);
    xhr.send(form);
  });
}
