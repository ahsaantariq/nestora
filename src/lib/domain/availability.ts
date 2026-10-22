export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type BlockingStay = {
  id: string;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
  /** ISO timestamp. Pending holds with a past expiry do not block. */
  holdExpiresAt: string | null;
};

const HARD_BLOCK = new Set<BookingStatus>(["CONFIRMED", "CHECKED_IN", "COMPLETED"]);

/** Half-open ranges: the checkout date can be the next check-in. */
export function rangesOverlap(
  aIn: string,
  aOut: string,
  bIn: string,
  bOut: string,
): boolean {
  return aIn < bOut && bIn < aOut;
}

export function stayBlocksCalendar(stay: BlockingStay, now: Date): boolean {
  if (stay.status === "PENDING") {
    if (!stay.holdExpiresAt) return true;
    const expiry = new Date(stay.holdExpiresAt).getTime();
    return Number.isFinite(expiry) && expiry > now.getTime();
  }
  return HARD_BLOCK.has(stay.status);
}

/**
 * Returns the first stay that would double-book the requested range.
 * Call this inside the same transaction that inserts `booking_nights`
 * (primary key on property, room, and night) so two requests cannot both win.
 */
export function findConflict(
  existing: BlockingStay[],
  requested: { checkIn: string; checkOut: string },
  now: Date,
): BlockingStay | null {
  if (!(requested.checkIn < requested.checkOut)) {
    throw new Error("Check-out must be after check-in");
  }
  for (const stay of existing) {
    if (!stayBlocksCalendar(stay, now)) continue;
    if (rangesOverlap(stay.checkIn, stay.checkOut, requested.checkIn, requested.checkOut)) {
      return stay;
    }
  }
  return null;
}

export type PartyInput = {
  adults: number;
  children: number;
  infants: number;
  pets: boolean;
  petCount: number;
};

export type Capacity = {
  maxGuests: number;
  petsAllowed: boolean;
  maxPets: number;
};

/** Adults, children, and infants all count toward the guest cap. */
export function validateParty(
  capacity: Capacity,
  party: PartyInput,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(party.adults) || party.adults < 1) {
    return { ok: false, reason: "Add at least one adult." };
  }
  for (const [label, value] of [
    ["children", party.children],
    ["infants", party.infants],
    ["pets", party.petCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      return { ok: false, reason: `Check the number of ${label}.` };
    }
  }
  const guests = party.adults + party.children + party.infants;
  if (guests > capacity.maxGuests) {
    return {
      ok: false,
      reason: `This stay sleeps ${capacity.maxGuests}, and this party is ${guests}.`,
    };
  }
  if ((party.pets || party.petCount > 0) && !capacity.petsAllowed) {
    return { ok: false, reason: "This stay does not allow pets." };
  }
  if (party.pets && party.petCount < 1) {
    return { ok: false, reason: "Add how many pets are coming." };
  }
  if (!party.pets && party.petCount > 0) {
    return { ok: false, reason: "Turn pets on, or set the pet count to zero." };
  }
  if (party.petCount > capacity.maxPets) {
    return {
      ok: false,
      reason: `This stay allows ${capacity.maxPets} ${capacity.maxPets === 1 ? "pet" : "pets"}.`,
    };
  }
  return { ok: true };
}
