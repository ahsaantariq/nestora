import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function keyBytes(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (raw && /^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const material = raw || process.env.BETTER_AUTH_SECRET || "nestora-preview-encryption-key";
  return scryptSync(material, "nestora-enc-v1", 32);
}

export function encryptionKeyFromEnv(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY?.trim());
}

/** AES-256-GCM. Output is versioned so the format can change later. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}

export function secretHint(value: string | null | undefined): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `••••${tail}`;
}
