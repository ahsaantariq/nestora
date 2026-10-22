export const APP_NAME = "Nestora";
export const TAGLINE = "Find your stay. List your space.";

export const ROLES = ["CUSTOMER", "OWNER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const PROPERTY_TYPES = [
  {
    id: "HOTEL",
    label: "Hotels",
    blurb: "A front desk, room types, and a night that runs on its own.",
  },
  {
    id: "HOUSE",
    label: "Houses",
    blurb: "The whole place: a lock, a kitchen, and the street outside.",
  },
  {
    id: "APARTMENT",
    label: "Apartments",
    blurb: "A city door of your own, above the noise if you want it.",
  },
  {
    id: "WAREHOUSE",
    label: "Warehouses",
    blurb: "Lofts and workrooms with height, light, and room to gather.",
  },
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number]["id"];

export const AMENITIES = [
  "Wifi",
  "Kitchen",
  "Washer",
  "Dryer",
  "Air conditioning",
  "Heating",
  "Workspace",
  "Pool",
  "Hot tub",
  "Free parking",
  "EV charger",
  "Self check-in",
  "Elevator",
  "Crib",
] as const;

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;

export function roleLabel(role: Role): string {
  if (role === "ADMIN") return "Admin";
  if (role === "OWNER") return "Host";
  return "Guest";
}
