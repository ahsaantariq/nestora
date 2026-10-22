export type CatalogSearch = {
  location?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  infants?: number;
  pets?: number;
  type?: "HOTEL" | "HOUSE" | "APARTMENT" | "WAREHOUSE";
  min?: number;
  max?: number;
  bedrooms?: number;
  instant?: number;
  rating?: number;
  amenities?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "rating";
  view?: "list" | "map";
};

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function parseCatalogSearch(search: Record<string, unknown>): CatalogSearch {
  const result: CatalogSearch = {};
  if (typeof search.location === "string" && search.location) result.location = search.location.slice(0, 120);
  if (typeof search.checkIn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.checkIn)) result.checkIn = search.checkIn;
  if (typeof search.checkOut === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.checkOut)) result.checkOut = search.checkOut;
  const adults = num(search.adults);
  if (adults != null) result.adults = Math.max(1, Math.min(16, Math.round(adults)));
  const children = num(search.children);
  if (children != null) result.children = Math.max(0, Math.min(16, Math.round(children)));
  const infants = num(search.infants);
  if (infants != null) result.infants = Math.max(0, Math.min(16, Math.round(infants)));
  const pets = num(search.pets);
  if (pets) result.pets = 1;
  if (search.type === "HOTEL" || search.type === "HOUSE" || search.type === "APARTMENT" || search.type === "WAREHOUSE") {
    result.type = search.type;
  }
  const min = num(search.min);
  if (min != null) result.min = Math.max(0, Math.round(min));
  const max = num(search.max);
  if (max != null) result.max = Math.max(0, Math.round(max));
  const bedrooms = num(search.bedrooms);
  if (bedrooms != null) result.bedrooms = Math.max(0, Math.round(bedrooms));
  if (num(search.instant)) result.instant = 1;
  const rating = num(search.rating);
  if (rating != null) result.rating = Math.max(0, Math.min(5, Math.round(rating)));
  if (typeof search.amenities === "string" && search.amenities) result.amenities = search.amenities.slice(0, 300);
  if (search.sort === "price_asc" || search.sort === "price_desc" || search.sort === "rating" || search.sort === "newest") {
    result.sort = search.sort;
  }
  if (search.view === "map" || search.view === "list") result.view = search.view;
  return result;
}
