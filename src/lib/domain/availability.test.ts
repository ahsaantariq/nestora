import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findConflict, rangesOverlap, validateParty, type BlockingStay } from "./availability.ts";

const now = new Date("2026-06-01T12:00:00.000Z");

function stay(partial: Partial<BlockingStay> & Pick<BlockingStay, "checkIn" | "checkOut" | "status">): BlockingStay {
  return {
    id: partial.id ?? "stay",
    holdExpiresAt: partial.holdExpiresAt ?? null,
    ...partial,
  };
}

describe("double booking", () => {
  it("treats ranges as half-open so checkout day can be rebooked", () => {
    assert.equal(rangesOverlap("2026-06-01", "2026-06-03", "2026-06-03", "2026-06-05"), false);
    assert.equal(rangesOverlap("2026-06-01", "2026-06-04", "2026-06-03", "2026-06-05"), true);
  });

  it("blocks confirmed stays and ignores cancelled ones", () => {
    const existing = [
      stay({ id: "gone", checkIn: "2026-07-01", checkOut: "2026-07-04", status: "CANCELLED" }),
      stay({ id: "paid", checkIn: "2026-07-02", checkOut: "2026-07-06", status: "CONFIRMED" }),
    ];
    const hit = findConflict(existing, { checkIn: "2026-07-05", checkOut: "2026-07-08" }, now);
    assert.equal(hit?.id, "paid");
    const free = findConflict(existing, { checkIn: "2026-07-06", checkOut: "2026-07-08" }, now);
    assert.equal(free, null);
  });

  it("holds pending dates for 15 minutes and then releases them", () => {
    const pending = stay({
      id: "hold",
      checkIn: "2026-08-01",
      checkOut: "2026-08-03",
      status: "PENDING",
      holdExpiresAt: "2026-06-01T12:15:00.000Z",
    });
    const during = findConflict([pending], { checkIn: "2026-08-01", checkOut: "2026-08-02" }, now);
    assert.equal(during?.id, "hold");
    const after = findConflict(
      [pending],
      { checkIn: "2026-08-01", checkOut: "2026-08-02" },
      new Date("2026-06-01T12:15:00.000Z"),
    );
    assert.equal(after, null);
  });

  it("does not let a refunded stay keep the calendar", () => {
    const existing = [
      stay({ checkIn: "2026-09-01", checkOut: "2026-09-04", status: "REFUNDED" }),
    ];
    assert.equal(
      findConflict(existing, { checkIn: "2026-09-01", checkOut: "2026-09-02" }, now),
      null,
    );
  });
});

describe("validateParty", () => {
  const capacity = { maxGuests: 4, petsAllowed: true, maxPets: 1 };

  it("counts infants toward capacity and enforces the pet policy", () => {
    assert.equal(
      validateParty(capacity, { adults: 2, children: 1, infants: 2, pets: false, petCount: 0 }).ok,
      false,
    );
    assert.equal(
      validateParty(capacity, { adults: 2, children: 0, infants: 0, pets: true, petCount: 2 }).ok,
      false,
    );
    assert.deepEqual(
      validateParty(
        { maxGuests: 4, petsAllowed: false, maxPets: 0 },
        { adults: 2, children: 0, infants: 0, pets: true, petCount: 1 },
      ),
      { ok: false, reason: "This stay does not allow pets." },
    );
    assert.equal(
      validateParty(capacity, { adults: 2, children: 1, infants: 1, pets: true, petCount: 1 }).ok,
      true,
    );
  });
});
