import { applyBps } from "./money.ts";

export type RefundRule = {
  /** Apply when hours until check-in are at least this value. */
  minHoursBeforeCheckIn: number;
  /** 10000 = 100% of the amount paid. */
  refundBps: number;
};

export type PolicyCode = "FLEXIBLE" | "MODERATE" | "STRICT";

export const DEFAULT_REFUND_RULES: Record<PolicyCode, RefundRule[]> = {
  FLEXIBLE: [
    { minHoursBeforeCheckIn: 24, refundBps: 10_000 },
    { minHoursBeforeCheckIn: 0, refundBps: 0 },
  ],
  MODERATE: [
    { minHoursBeforeCheckIn: 120, refundBps: 10_000 },
    { minHoursBeforeCheckIn: 0, refundBps: 5_000 },
  ],
  STRICT: [
    { minHoursBeforeCheckIn: 168, refundBps: 5_000 },
    { minHoursBeforeCheckIn: 0, refundBps: 0 },
  ],
};

export type RefundResult = {
  refundCents: number;
  retainedCents: number;
  refundBps: number;
};

/**
 * Refund owed to the guest's card.
 * Rules are matched from the largest lead time downward.
 * A full-refund override (admin) returns the entire amount paid.
 * Cancelling at or after check-in refunds nothing, unless overridden.
 */
export function calculateRefund(input: {
  rules: RefundRule[];
  checkInAt: Date;
  cancelledAt: Date;
  amountPaidCents: number;
  fullRefundOverride?: boolean;
}): RefundResult {
  if (!Number.isInteger(input.amountPaidCents) || input.amountPaidCents < 0) {
    throw new Error("Amount paid must be zero or more cents");
  }
  if (input.fullRefundOverride) {
    return {
      refundCents: input.amountPaidCents,
      retainedCents: 0,
      refundBps: input.amountPaidCents === 0 ? 0 : 10_000,
    };
  }
  const hours =
    (input.checkInAt.getTime() - input.cancelledAt.getTime()) / 3_600_000;
  if (hours < 0) {
    return { refundCents: 0, retainedCents: input.amountPaidCents, refundBps: 0 };
  }
  const rules = [...input.rules].sort(
    (a, b) => b.minHoursBeforeCheckIn - a.minHoursBeforeCheckIn,
  );
  const match = rules.find((rule) => hours >= rule.minHoursBeforeCheckIn);
  const refundBps = match ? Math.min(10_000, Math.max(0, match.refundBps)) : 0;
  const refundCents = Math.min(input.amountPaidCents, applyBps(input.amountPaidCents, refundBps));
  return {
    refundCents,
    retainedCents: input.amountPaidCents - refundCents,
    refundBps,
  };
}
