import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AMENITIES, PROPERTY_TYPES } from "@/lib/nestora/constants";
import { parseCatalogSearch, type CatalogSearch } from "@/lib/nestora/catalog-search";
import { searchCatalog } from "@/lib/nestora/functions";
import type { StayCard } from "@/lib/nestora/data.server";
import { formatMoney } from "@/lib/domain/money";
import { PublicFrame } from "@/components/site-chrome";
import { SearchBar } from "@/components/search-bar";
import { EmptyState, SelectInput, Skeleton, TextInput } from "@/components/ui";

export const Route = createFileRoute("/search")({
  validateSearch: (search) => parseCatalogSearch(search),
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [stays, setStays] = useState<StayCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guests = (search.adults ?? 0) + (search.children ?? 0) + (search.infants ?? 0);
  const amenities = (search.amenities ?? "").split(",").map((item) => item.trim()).filter(Boolean);

  useEffect(() => {
    let cancelled = false;
    setStays(null);
    setError(null);
    searchCatalog({
      data: {
        location: search.location ?? "",
        type: search.type ?? "",
        minCents: search.min != null ? Math.round(search.min * 100) : null,
        maxCents: search.max != null ? Math.round(search.max * 100) : null,
        guests,
        bedrooms: search.bedrooms ?? 0,
        pets: search.pets === 1,
        instant: search.instant === 1,
        minRating: search.rating ?? 0,
        amenities,
        sort: search.sort ?? "newest",
      },
    })
      .then((rows) => {
        if (!cancelled) setStays(rows);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Search failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [
    search.location,
    search.type,
    search.min,
    search.max,
    search.bedrooms,
    search.pets,
    search.instant,
    search.rating,
    search.amenities,
    search.sort,
    guests,
  ]);

  function patch(next: CatalogSearch) {
    void navigate({ search: (prev) => ({ ...prev, ...next }) });
  }

  return (
    <PublicFrame>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-4xl">Stays</h1>
        <p className="mt-2 text-sm text-muted">Live listings only. Filters apply to what's actually approved.</p>
        <div className="mt-6">
          <SearchBar
            initial={{
              location: search.location ?? "",
              checkIn: search.checkIn ?? "",
              checkOut: search.checkOut ?? "",
              adults: search.adults ?? 1,
              children: search.children ?? 0,
              infants: search.infants ?? 0,
              pets: search.pets === 1,
            }}
          />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
          <form className="space-y-4 rounded-card bg-surface p-4 shadow-soft" onSubmit={(event) => event.preventDefault()}>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Type</span>
              <SelectInput
                value={search.type ?? ""}
                onChange={(event) =>
                  patch({ type: event.target.value ? (event.target.value as CatalogSearch["type"]) : undefined })
                }
              >
                <option value="">Any</option>
                {PROPERTY_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </SelectInput>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Min / night</span>
                <TextInput
                  inputMode="numeric"
                  value={search.min ?? ""}
                  placeholder="0"
                  onChange={(event) => patch({ min: event.target.value === "" ? undefined : Number(event.target.value) })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Max / night</span>
                <TextInput
                  inputMode="numeric"
                  value={search.max ?? ""}
                  placeholder="Any"
                  onChange={(event) => patch({ max: event.target.value === "" ? undefined : Number(event.target.value) })}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Bedrooms</span>
              <SelectInput
                value={search.bedrooms ?? 0}
                onChange={(event) => patch({ bedrooms: Number(event.target.value) || undefined })}
              >
                <option value={0}>Any</option>
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count}+
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Pets allowed</span>
              <input type="checkbox" className="size-4" checked={search.pets === 1} onChange={(event) => patch({ pets: event.target.checked ? 1 : undefined })} />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Instant book</span>
              <input type="checkbox" className="size-4" checked={search.instant === 1} onChange={(event) => patch({ instant: event.target.checked ? 1 : undefined })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Minimum rating</span>
              <SelectInput value={search.rating ?? 0} onChange={(event) => patch({ rating: Number(event.target.value) || undefined })}>
                <option value={0}>Any</option>
                {[3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}+
                  </option>
                ))}
              </SelectInput>
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Amenities</legend>
              <div className="space-y-2">
                {AMENITIES.map((amenity) => {
                  const on = amenities.includes(amenity);
                  return (
                    <label key={amenity} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={on}
                        onChange={() => {
                          const next = on ? amenities.filter((item) => item !== amenity) : [...amenities, amenity];
                          patch({ amenities: next.join(",") || undefined });
                        }}
                      />
                      {amenity}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </form>
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex rounded-button border border-line bg-surface p-1">
                <button type="button" className={`h-9 rounded-button px-3 text-sm ${search.view !== "map" ? "bg-primary text-surface" : ""}`} onClick={() => patch({ view: "list" })}>
                  List
                </button>
                <button type="button" className={`h-9 rounded-button px-3 text-sm ${search.view === "map" ? "bg-primary text-surface" : ""}`} onClick={() => patch({ view: "map" })}>
                  Map
                </button>
              </div>
              <label className="text-sm">
                <span className="sr-only">Sort</span>
                <SelectInput value={search.sort ?? "newest"} onChange={(event) => patch({ sort: event.target.value as CatalogSearch["sort"] })}>
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price, low to high</option>
                  <option value="price_desc">Price, high to low</option>
                  <option value="rating">Rating</option>
                </SelectInput>
              </label>
            </div>
            {search.view === "map" ? (
              <div className="mb-4 rounded-card border border-line bg-surface p-6 text-sm text-muted">
                Map pins appear when a live stay has a location. There is nothing to pin until a host is approved.
              </div>
            ) : null}
            {stays == null && !error ? (
              <div className="space-y-3">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : null}
            {error ? <EmptyState title="Search didn't finish" body={error} /> : null}
            {stays && stays.length === 0 ? (
              <EmptyState
                title="No stays match"
                body="Nothing live fits these filters. Widen them, or list a space of your own."
                action={
                  <Link to="/list" className="text-sm font-medium text-primary">
                    List your space
                  </Link>
                }
              />
            ) : null}
            <div className="space-y-3">
              {stays?.map((stay) => (
                <Link key={stay.id} to="/stay/$slug" params={{ slug: stay.slug }} className="block rounded-card bg-surface p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">{labelFor(stay.propertyType)}</p>
                      <h2 className="mt-1 font-display text-2xl">{stay.title}</h2>
                      <p className="mt-1 text-sm text-muted">{[stay.city, stay.region].filter(Boolean).join(", ") || "Location on request"}</p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">{formatMoney(stay.nightlyCents)}</p>
                  </div>
                  {stay.summary ? <p className="mt-3 text-sm text-muted">{stay.summary}</p> : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PublicFrame>
  );
}

function labelFor(type: string) {
  return PROPERTY_TYPES.find((item) => item.id === type)?.label ?? type;
}
