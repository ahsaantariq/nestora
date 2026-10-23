import { createHmac, timingSafeEqual } from "node:crypto";

export function maskSensitive(value: string): string {
  return value
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[card]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) => {
      const [name, host] = email.split("@");
      return `${(name ?? "").slice(0, 1)}•••@${host ?? ""}`;
    });
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Twilio signs url + concatenated sorted POST params with HMAC-SHA1, base64. */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(payload).digest("base64");
}

export function verifyTwilioSignature(url: string, params: Record<string, string>, header: string | null, authToken: string): boolean {
  if (!header || !authToken) return false;
  return safeEqual(twilioSignature(url, params, authToken), header);
}

/** Zernio: lowercase hex HMAC-SHA256 of the raw body, header X-Zernio-Signature. */
export function zernioSignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyZernioSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const given = header.trim().toLowerCase();
  return safeEqual(zernioSignature(rawBody, secret), given);
}
