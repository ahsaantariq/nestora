import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateStayPrice, ownerNet } from "./pricing.ts";
import { applyBps } from "./money.ts";

const base = {
  weeklyDiscountBps: 0,
  monthlyDiscountBps: 0,
  extraGuestFeeCents: 0,
  includedGuests: 2,
  adults: 2,
  children: 0,
  infants: 0,
  petFeeCents: 0,
  petCount: 0,
  cleaningFeeCents: 0,
  securityDepositCents: 0,
  taxBps: 0,
  serviceFeeBps: 0,
};

describe("calculateStayPrice", () => {
  it("charges weekend nights separately and leaves the deposit out of the total", () => {
    let friday = Date.UTC(2026, 0, 1);
    while (new Date(friday).getUTCDay() !== 5) friday += 86_400_000;
    const checkIn = new Date(friday).toISOString().slice(0, 10);
    const checkOut = new Date(friday + 3 * 86_400_000).toISOString().slice(0, 10);
    const quote = calculateStayPrice({
      ...base,
      checkIn,
      checkOut,
      nightlyCents: 10_000,
      weekendCents: 15_000,
      cleaningFeeCents: 4_000,
      securityDepositCents: 20_000,
      taxBps: 1_000,
      serviceFeeBps: 500,
    });
    assert.equal(quote.nights, 3);
    assert.equal(quote.nightlySubtotalCents, 40_000);
    assert.equal(quote.cleaningFeeCents, 4_000);
    const preTax = 44_000;
    assert.equal(quote.serviceFeeCents, applyBps(preTax, 500));
    assert.equal(quote.taxCents, applyBps(preTax, 1_000));
    assert.equal(quote.totalCents, preTax + quote.serviceFeeCents + quote.taxCents);
    assert.equal(quote.securityDepositCents, 20_000);
    assert.equal(quote.lines.some((line) => line.label === "Security deposit"), false);
  });

  it("applies a weekly discount at 7 nights and a monthly discount instead at 28", () => {
    const week = calculateStayPrice({
      ...base,
      checkIn: "2026-01-01",
      checkOut: "2026-01-08",
      nightlyCents: 10_000,
      weekendCents: null,
      weeklyDiscountBps: 1_000,
      monthlyDiscountBps: 2_000,
    });
    assert.equal(week.nights, 7);
    assert.equal(week.discountCents, 7_000);
    assert.equal(week.totalCents, 63_000);

    const month = calculateStayPrice({
      ...base,
      checkIn: "2026-01-01",
      checkOut: "2026-01-29",
      nightlyCents: 10_000,
      weekendCents: null,
      weeklyDiscountBps: 1_000,
      monthlyDiscountBps: 2_000,
    });
    assert.equal(month.nights, 28);
    assert.equal(month.discountCents, 56_000);
    assert.equal(month.totalCents, 224_000);
  });

  it("does not charge infants as extra guests and does charge pets", () => {
    const quote = calculateStayPrice({
      ...base,
      checkIn: "2026-03-01",
      checkOut: "2026-03-03",
      nightlyCents: 10_000,
      weekendCents: null,
      extraGuestFeeCents: 2_000,
      includedGuests: 2,
      adults: 2,
      children: 1,
      infants: 1,
      petFeeCents: 3_500,
      petCount: 2,
    });
    assert.equal(quote.extraGuestCents, 4_000);
    assert.equal(quote.petFeeCents, 7_000);
    assert.equal(quote.totalCents, 20_000 + 4_000 + 7_000);
  });

  it("lets a custom night replace the weekend rate", () => {
    let friday = Date.UTC(2026, 5, 1);
    while (new Date(friday).getUTCDay() !== 5) friday += 86_400_000;
    const checkIn = new Date(friday).toISOString().slice(0, 10);
    const quote = calculateStayPrice({
      ...base,
      checkIn,
      checkOut: new Date(friday + 86_400_000).toISOString().slice(0, 10),
      nightlyCents: 10_000,
      weekendCents: 18_000,
      customNightCents: { [checkIn]: 12_500 },
    });
    assert.equal(quote.nightlySubtotalCents, 12_500);
  });

  it("rounds a fractional service fee to the nearest cent", () => {
    const quote = calculateStayPrice({
      ...base,
      checkIn: "2026-04-01",
      checkOut: "2026-04-02",
      nightlyCents: 333,
      weekendCents: null,
      serviceFeeBps: 1_000,
    });
    assert.equal(quote.serviceFeeCents, 33);
    assert.equal(quote.totalCents, 366);
  });
});

describe("ownerNet", () => {
  it("deducts a percent commission and managed fees", () => {
    const net = ownerNet({
      accommodationCents: 80_000,
      cleaningFeeCents: 5_000,
      commissionEnabled: true,
      commissionType: "PERCENT",
      commissionFixedCents: 0,
      commissionBps: 1_000,
      managed: {
        accommodationCents: 80_000,
        cleaningFeeCents: 4_000,
        managementBps: 1_500,
        linenCents: 1_500,
        maintenanceCents: 1_000,
        customFees: [{ name: "Restock", cents: 500 }],
      },
    });
    assert.equal(net.ownerBaseCents, 85_000);
    assert.equal(net.commissionCents, 8_500);
    assert.equal(net.managedCents, 4_000 + 12_000 + 1_500 + 1_000 + 500);
    assert.equal(net.netCents, 85_000 - 8_500 - 19_000);
  });

  it("keeps the full base when commission is off and the owner manages the stay", () => {
    const net = ownerNet({
      accommodationCents: 40_000,
      cleaningFeeCents: 0,
      commissionEnabled: false,
      commissionType: "FIXED",
      commissionFixedCents: 9_000,
      commissionBps: 2_000,
      managed: null,
    });
    assert.equal(net.commissionCents, 0);
    assert.equal(net.netCents, 40_000);
  });
});
