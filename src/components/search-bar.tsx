import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Minus, Plus, Search } from "lucide-react";
import { Button, TextInput } from "@/components/ui";

export type GuestQuery = {
  location: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  pets: boolean;
};

const empty: GuestQuery = {
  location: "",
  checkIn: "",
  checkOut: "",
  adults: 1,
  children: 0,
  infants: 0,
  pets: false,
};

export function SearchBar({ initial }: { initial?: Partial<GuestQuery> }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState<GuestQuery>({ ...empty, ...initial });
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if ((query.checkIn && !query.checkOut) || (!query.checkIn && query.checkOut)) {
      setError("Add both a check-in and a check-out, or leave the dates open.");
      return;
    }
    if (query.checkIn && query.checkOut && query.checkOut <= query.checkIn) {
      setError("Check-out has to be after check-in.");
      return;
    }
    if (query.adults < 1) {
      setError("Add at least one adult.");
      return;
    }
    setError(null);
    void navigate({
      to: "/search",
      search: {
        location: query.location.trim(),
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        adults: query.adults,
        children: query.children,
        infants: query.infants,
        pets: query.pets ? 1 : 0,
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-card bg-surface p-3 shadow-lift sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Where</span>
          <TextInput
            value={query.location}
            placeholder="City, region, or country"
            autoComplete="off"
            onChange={(event) => setQuery({ ...query, location: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Check in</span>
          <TextInput
            type="date"
            value={query.checkIn}
            onChange={(event) => setQuery({ ...query, checkIn: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Check out</span>
          <TextInput
            type="date"
            value={query.checkOut}
            min={query.checkIn || undefined}
            onChange={(event) => setQuery({ ...query, checkOut: event.target.value })}
          />
        </label>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium">Guests</legend>
          <div className="space-y-2 rounded-button border border-line px-3 py-2">
            <Stepper label="Adults" value={query.adults} min={1} onChange={(adults) => setQuery({ ...query, adults })} />
            <Stepper label="Children" value={query.children} min={0} onChange={(children) => setQuery({ ...query, children })} />
            <Stepper label="Infants" value={query.infants} min={0} onChange={(infants) => setQuery({ ...query, infants })} />
            <label className="flex items-center justify-between gap-3 py-1 text-sm">
              <span>Pets</span>
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={query.pets}
                onChange={(event) => setQuery({ ...query, pets: event.target.checked })}
              />
            </label>
          </div>
        </fieldset>
        <Button type="submit" className="w-full lg:w-auto">
          <Search className="size-4" aria-hidden="true" />
          Search
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-button border border-line"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus className="size-4" />
        </button>
        <span className="w-5 text-center tabular-nums">{value}</span>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-button border border-line"
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(16, value + 1))}
        >
          <Plus className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
