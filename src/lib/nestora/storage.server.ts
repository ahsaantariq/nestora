import { createHash, createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";

export type StoredObject = { url: string; publicId: string; driver: "cloudinary" | "s3" | "inline" };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export function classifyUpload(mime: string, name: string): "IMAGE" | "VIDEO" {
  const lower = name.toLowerCase();
  if (IMAGE_TYPES.has(mime) || /\.(jpe?g|png|webp)$/.test(lower)) return "IMAGE";
  if (VIDEO_TYPES.has(mime) || /\.(mp4|mov|webm)$/.test(lower)) return "VIDEO";
  throw new Error("Use a JPG, PNG, or WebP image, or an MP4, MOV, or WebM video.");
}

export function assertUpload(kind: "IMAGE" | "VIDEO", mime: string, size: number) {
  if (kind === "IMAGE") {
    if (!IMAGE_TYPES.has(mime) && mime !== "application/octet-stream") {
      throw new Error("Images must be JPG, PNG, or WebP.");
    }
    if (size > 10 * 1024 * 1024) throw new Error("Images must be 10 MB or smaller.");
  } else {
    if (!VIDEO_TYPES.has(mime) && mime !== "application/octet-stream") {
      throw new Error("Videos must be MP4, MOV, or WebM.");
    }
    if (size > 200 * 1024 * 1024) throw new Error("Videos must be 200 MB or smaller.");
  }
  if (size <= 0) throw new Error("That file is empty.");
}

function driverName(): "cloudinary" | "s3" | "inline" {
  const forced = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (forced === "s3" || forced === "cloudinary" || forced === "inline") return forced;
  if (process.env.CLOUDINARY_CLOUD_NAME?.trim() && process.env.CLOUDINARY_API_KEY?.trim() && process.env.CLOUDINARY_API_SECRET?.trim()) {
    return "cloudinary";
  }
  if (process.env.S3_BUCKET?.trim() && process.env.S3_ACCESS_KEY_ID?.trim() && process.env.S3_SECRET_ACCESS_KEY?.trim()) {
    return "s3";
  }
  return "inline";
}

export async function putObject(input: {
  bytes: Buffer;
  mime: string;
  filename: string;
  kind: "IMAGE" | "VIDEO";
}): Promise<StoredObject> {
  const driver = driverName();
  if (driver === "cloudinary") return cloudinaryPut(input);
  if (driver === "s3") return s3Put(input);
  if (input.kind === "VIDEO") {
    throw new Error("Video upload needs Cloudinary or S3 storage. Images can still be saved until then.");
  }
  if (input.bytes.length > 1_500_000) {
    throw new Error("That image is still large after compression. Connect Cloudinary or S3 to store it.");
  }
  const id = randomUUID();
  return { url: `data:${input.mime};base64,${input.bytes.toString("base64")}`, publicId: `inline:${id}`, driver: "inline" };
}

async function cloudinaryPut(input: { bytes: Buffer; mime: string; filename: string; kind: "IMAGE" | "VIDEO" }): Promise<StoredObject> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY!.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET!.trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "nestora";
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(input.bytes)], { type: input.mime }), input.filename);
  form.set("api_key", apiKey);
  form.set("timestamp", String(timestamp));
  form.set("signature", signature);
  form.set("folder", folder);
  const resource = input.kind === "VIDEO" ? "video" : "image";
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`, { method: "POST", body: form });
  const json = (await response.json()) as { secure_url?: string; public_id?: string; error?: { message?: string } };
  if (!response.ok || !json.secure_url || !json.public_id) {
    throw new Error(json.error?.message || "The file store rejected that upload.");
  }
  return { url: json.secure_url, publicId: json.public_id, driver: "cloudinary" };
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data).digest();
}

async function s3Put(input: { bytes: Buffer; mime: string; filename: string; kind: "IMAGE" | "VIDEO" }): Promise<StoredObject> {
  const bucket = process.env.S3_BUCKET!.trim();
  const region = process.env.S3_REGION?.trim() || "us-east-1";
  const accessKey = process.env.S3_ACCESS_KEY_ID!.trim();
  const secret = process.env.S3_SECRET_ACCESS_KEY!.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const objectKey = `nestora/${Date.now()}-${input.filename.replace(/[^\w.\-]+/g, "-")}`;
  const host = endpoint ? new URL(endpoint).host : `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalUri = endpoint ? `/${bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}` : `/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(input.bytes).digest("hex");
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = endpoint ? `${endpoint.replace(/\/$/, "")}${canonicalUri}` : `https://${host}${canonicalUri}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "Content-Type": input.mime,
    },
    body: new Uint8Array(input.bytes),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.slice(0, 180) || "Object storage rejected that upload.");
  }
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const publicUrl = publicBase ? `${publicBase}/${objectKey}` : endpoint ? url : `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;
  return { url: publicUrl, publicId: objectKey, driver: "s3" };
}
