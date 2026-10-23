import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { addMediaUrl } from "@/lib/nestora/listings.server";
import { assertUpload, classifyUpload, putObject } from "@/lib/nestora/storage.server";

export const Route = createFileRoute("/api/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id) return Response.json({ error: "Sign in to upload." }, { status: 401 });
        const form = await request.formData();
        const purpose = String(form.get("purpose") ?? "");
        const file = form.get("file");
        if (purpose === "cms") {
          if (!(file instanceof File)) return Response.json({ error: "Choose an image." }, { status: 400 });
          try {
            const { requireActive } = await import("@/lib/nestora/data.server");
            await requireActive(session.user.id, ["ADMIN"]);
            const kind = classifyUpload(file.type || "image/jpeg", file.name);
            if (kind !== "IMAGE") return Response.json({ error: "Page images must be JPG, PNG, or WebP." }, { status: 400 });
            assertUpload(kind, file.type || "image/jpeg", file.size);
            const bytes = Buffer.from(await file.arrayBuffer());
            const stored = await putObject({ bytes, mime: file.type || "image/jpeg", filename: file.name, kind });
            return Response.json({ url: stored.url });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Upload failed.";
            return Response.json({ error: message }, { status: 400 });
          }
        }
        const propertyId = String(form.get("propertyId") ?? "");
        if (!propertyId || !(file instanceof File)) {
          return Response.json({ error: "Choose a file to upload." }, { status: 400 });
        }
        try {
          const kind = classifyUpload(file.type || "application/octet-stream", file.name);
          assertUpload(kind, file.type || (kind === "IMAGE" ? "image/jpeg" : "video/mp4"), file.size);
          const bytes = Buffer.from(await file.arrayBuffer());
          const stored = await putObject({ bytes, mime: file.type || "application/octet-stream", filename: file.name, kind });
          const listing = await addMediaUrl(session.user.id, propertyId, stored.url, kind, stored.publicId);
          return Response.json(listing);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
