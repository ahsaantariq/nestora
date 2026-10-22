const DAY = 86_400_000;

export function parseISODate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Use a YYYY-MM-DD date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("That date is not on the calendar");
  }
  return date;
}

export function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Nights occupied: [checkIn, checkOut). Checkout morning is free. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const start = parseISODate(checkIn);
  const end = parseISODate(checkOut);
  if (end.getTime() <= start.getTime()) {
    throw new Error("Check-out must be after check-in");
  }
  const nights: string[] = [];
  for (let time = start.getTime(); time < end.getTime(); time += DAY) {
    nights.push(formatISODate(new Date(time)));
  }
  return nights;
}

/** Friday and Saturday nights use the weekend rate. */
export function isWeekendNight(isoDate: string): boolean {
  const day = parseISODate(isoDate).getUTCDay();
  return day === 5 || day === 6;
}
