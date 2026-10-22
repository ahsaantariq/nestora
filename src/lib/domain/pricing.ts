import { isWeekendNight, stayNights } from "./dates.ts";
import { applyBps } from "./money.ts";

export type PriceInput = {
  checkIn: string;
  checkOut: string;
  nightlyCents: number;
  weekendCents: number | null;
  weeklyDiscountBps: number;
  monthlyDiscountBps: number;
  extraGuestFeeCents: number;
  includedGuests: number;
  adults: number;
  children: number;
  infants: number;
  petFeeCents: number;
  petCount: number;
  cleaningFeeCents: number;
  securityDepositCents: number;
  taxBps: number;
  serviceFeeBps: number;
  /** Per-night overrides in cents, keyed by YYYY-MM-DD. */
  customNightCents?: Record<string, number>;
};

export type PriceLine = { label: string; cents: number; kind?: "charge" | "discount" | "note" };

export type PriceBreakdown = {
  nights: number;
  nightlySubtotalCents: number;
  discountCents: number;
  extraGuestCents: number;
  petFeeCents: number;
  cleaningFeeCents: number;
  serviceFeeCents: number;
  taxCents: number;
  totalCents: number;
  securityDepositCents: number;
  lines: PriceLine[];
};

function nonNegative(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number of cents, zero or more`);
  }
}

/**
 * Guest-facing total.
 * Infants do not count toward extra-guest fees.
 * Weekly (7+) and monthly (28+) discounts do not stack; monthly wins.
 * Security deposit is shown and is not part of the charged total.
 * Tax and the service fee are calculated on lodging + fees, after discount.
 */
export function calculateStayPrice(input: PriceInput): PriceBreakdown {
  nonNegative("nightly rate", input.nightlyCents);
  if (input.weekendCents != null) nonNegative("weekend rate", input.weekendCents);
  nonNegative("weekly discount", input.weeklyDiscountBps);
  nonNegative("monthly discount", input.monthlyDiscountBps);
  if (input.weeklyDiscountBps > 10_000 || input.monthlyDiscountBps > 10_000) {
    throw new Error("A discount cannot exceed 100%");
  }
  nonNegative("extra guest fee", input.extraGuestFeeCents);
  nonNegative("included guests", input.includedGuests);
  nonNegative("pet fee", input.petFeeCents);
  nonNegative("cleaning fee", input.cleaningFeeCents);
  nonNegative("security deposit", input.securityDepositCents);
  nonNegative("tax", input.taxBps);
  nonNegative("service fee", input.serviceFeeBps);
  for (const count of [input.adults, input.children, input.infants, input.petCount]) {
    if (!Number.isInteger(count) || count < 0) throw new Error("Guest counts must be whole numbers");
  }

  const nights = stayNights(input.checkIn, input.checkOut);
  let nightlySubtotalCents = 0;
  for (const night of nights) {
    const custom = input.customNightCents?.[night];
    if (custom != null) {
      nonNegative("custom night rate", custom);
      nightlySubtotalCents += custom;
      continue;
    }
    const weekend = input.weekendCents != null && isWeekendNight(night);
    nightlySubtotalCents += weekend ? input.weekendCents! : input.nightlyCents;
  }

  const discountBps =
    nights.length >= 28
      ? input.monthlyDiscountBps
      : nights.length >= 7
        ? input.weeklyDiscountBps
        : 0;
  const discountCents = applyBps(nightlySubtotalCents, discountBps);
  const payingGuests = input.adults + input.children;
  const extraGuests = Math.max(0, payingGuests - input.includedGuests);
  const extraGuestCents = extraGuests * input.extraGuestFeeCents * nights.length;
  const petFeeCents = input.petCount > 0 ? input.petFeeCents * input.petCount : 0;
  const cleaningFeeCents = input.cleaningFeeCents;
  const preTaxCents =
    nightlySubtotalCents - discountCents + extraGuestCents + petFeeCents + cleaningFeeCents;
  const serviceFeeCents = applyBps(preTaxCents, input.serviceFeeBps);
  const taxCents = applyBps(preTaxCents, input.taxBps);
  const totalCents = preTaxCents + serviceFeeCents + taxCents;

  const lines: PriceLine[] = [
    {
      label: `${nights.length} ${nights.length === 1 ? "night" : "nights"}`,
      cents: nightlySubtotalCents,
    },
  ];
  if (discountCents > 0) {
    lines.push({
      label: nights.length >= 28 ? "Monthly discount" : "Weekly discount",
      cents: -discountCents,
      kind: "discount",
    });
  }
  if (extraGuestCents > 0) {
    lines.push({ label: "Extra guests", cents: extraGuestCents });
  }
  if (petFeeCents > 0) {
    lines.push({ label: "Pets", cents: petFeeCents });
  }
  if (cleaningFeeCents > 0) {
    lines.push({ label: "Cleaning fee", cents: cleaningFeeCents });
  }
  if (serviceFeeCents > 0) {
    lines.push({ label: "Service fee", cents: serviceFeeCents });
  }
  if (taxCents > 0) {
    lines.push({ label: "Taxes", cents: taxCents });
  }

  return {
    nights: nights.length,
    nightlySubtotalCents,
    discountCents,
    extraGuestCents,
    petFeeCents,
    cleaningFeeCents,
    serviceFeeCents,
    taxCents,
    totalCents,
    securityDepositCents: input.securityDepositCents,
    lines,
  };
}

export type ManagedFeeInput = {
  accommodationCents: number;
  cleaningFeeCents: number;
  managementBps: number;
  linenCents: number;
  maintenanceCents: number;
  customFees: { name: string; cents: number }[];
};

/** Fees Nestora deducts when a property is handed over to be managed. */
export function managedFeeLines(input: ManagedFeeInput): { lines: PriceLine[]; totalCents: number } {
  const managementCents = applyBps(input.accommodationCents, input.managementBps);
  const lines: PriceLine[] = [];
  if (input.cleaningFeeCents > 0) lines.push({ label: "Managed cleaning", cents: input.cleaningFeeCents });
  if (managementCents > 0) lines.push({ label: "Management fee", cents: managementCents });
  if (input.linenCents > 0) lines.push({ label: "Linen and laundry", cents: input.linenCents });
  if (input.maintenanceCents > 0) lines.push({ label: "Maintenance reserve", cents: input.maintenanceCents });
  for (const fee of input.customFees) {
    if (fee.cents > 0) lines.push({ label: fee.name, cents: fee.cents });
  }
  const totalCents = lines.reduce((sum, line) => sum + line.cents, 0);
  return { lines, totalCents };
}

export type PayoutInput = {
  /** Nights after discount + extra guests + pets. Excludes cleaning. */
  accommodationCents: number;
  cleaningFeeCents: number;
  commissionEnabled: boolean;
  commissionType: "FIXED" | "PERCENT";
  commissionFixedCents: number;
  commissionBps: number;
  managed: ManagedFeeInput | null;
};

/**
 * Owner net from one stay.
 * Nestora keeps the guest service fee and tax (not passed in here).
 * Commission applies to accommodation + the guest cleaning fee.
 * Managed-property fees are deducted after commission.
 */
export function ownerNet(input: PayoutInput): {
  ownerBaseCents: number;
  commissionCents: number;
  managedCents: number;
  netCents: number;
} {
  const ownerBaseCents = input.accommodationCents + input.cleaningFeeCents;
  const commissionCents = !input.commissionEnabled
    ? 0
    : input.commissionType === "FIXED"
      ? Math.min(input.commissionFixedCents, ownerBaseCents)
      : applyBps(ownerBaseCents, input.commissionBps);
  const managedCents = input.managed ? managedFeeLines(input.managed).totalCents : 0;
  return {
    ownerBaseCents,
    commissionCents,
    managedCents,
    netCents: ownerBaseCents - commissionCents - managedCents,
  };
}
