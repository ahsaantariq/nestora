import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_REFUND_RULES, calculateRefund } from "./refund.ts";

const checkIn = new Date("2026-07-10T15:00:00.000Z");

function cancelHoursBefore(hours: number) {
  return new Date(checkIn.getTime() - hours * 3_600_000);
}

describe("calculateRefund", () => {
  it("refunds a flexible stay in full at 24 hours and nothing after that", () => {
    const full = calculateRefund({
      rules: DEFAULT_REFUND_RULES.FLEXIBLE,
      checkInAt: checkIn,
      cancelledAt: cancelHoursBefore(24),
      amountPaidCents: 20_000,
    });
    assert.equal(full.refundCents, 20_000);
    assert.equal(full.retainedCents, 0);

    const late = calculateRefund({
      rules: DEFAULT_REFUND_RULES.FLEXIBLE,
      checkInAt: checkIn,
      cancelledAt: cancelHoursBefore(23.9),
      amountPaidCents: 20_000,
    });
    assert.equal(late.refundCents, 0);
    assert.equal(late.retainedCents, 20_000);
  });

  it("refunds half on a moderate policy inside five days", () => {
    const result = calculateRefund({
      rules: DEFAULT_REFUND_RULES.MODERATE,
      checkInAt: checkIn,
      cancelledAt: cancelHoursBefore(48),
      amountPaidCents: 10_001,
    });
    assert.equal(result.refundBps, 5_000);
    assert.equal(result.refundCents, 5_001);
    assert.equal(result.retainedCents, 5_000);
  });

  it("refunds half on a strict policy a week out, and nothing the day before", () => {
    const early = calculateRefund({
      rules: DEFAULT_REFUND_RULES.STRICT,
      checkInAt: checkIn,
      cancelledAt: cancelHoursBefore(168),
      amountPaidCents: 8_000,
    });
    assert.equal(early.refundCents, 4_000);
    const late = calculateRefund({
      rules: DEFAULT_REFUND_RULES.STRICT,
      checkInAt: checkIn,
      cancelledAt: cancelHoursBefore(10),
      amountPaidCents: 8_000,
    });
    assert.equal(late.refundCents, 0);
  });

  it("refunds nothing after check-in unless an admin overrides to a full refund", () => {
    const late = calculateRefund({
      rules: DEFAULT_REFUND_RULES.FLEXIBLE,
      checkInAt: checkIn,
      cancelledAt: new Date(checkIn.getTime() + 60_000),
      amountPaidCents: 15_000,
    });
    assert.equal(late.refundCents, 0);
    const override = calculateRefund({
      rules: DEFAULT_REFUND_RULES.STRICT,
      checkInAt: checkIn,
      cancelledAt: new Date(checkIn.getTime() + 60_000),
      amountPaidCents: 15_000,
      fullRefundOverride: true,
    });
    assert.equal(override.refundCents, 15_000);
    assert.equal(override.retainedCents, 0);
  });
});
