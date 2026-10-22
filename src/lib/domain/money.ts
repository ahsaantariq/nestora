/** Integer cents. Never store card numbers or raw payment credentials. */

export function applyBps(amountCents: number, bps: number): number {
  if (!Number.isFinite(amountCents) || !Number.isFinite(bps)) {
    throw new Error("Amount and rate must be finite numbers");
  }
  return Math.round((amountCents * bps) / 10_000);
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatBps(bps: number): string {
  const percent = bps / 100;
  const text = Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2);
  return `${text}%`;
}
