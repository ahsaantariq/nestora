import { useEffect, useRef, useState, type FormEvent } from "react";
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const guestsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!guestsRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const guestCount = query.adults + query.children + query.infants;
  const summary = `${guestCount} guest${guestCount === 1 ? "" : "s"}${query.pets ? ", 1 pet" : ""}`;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if ((query.checkIn && !query.checkOut) || (!query.checkIn && query.checkOut)) {
      setError("Add both a check-in and a check-out, or leave the dates open.");
      return;
    }
    if (query.checkIn && query.checkOut && query.checkOut <= query.checkIn) {
      setError("Check-out has to be after check-in.");
      return;
    }
    setError(null);
    setLoading(true);
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
    }).finally(() => setLoading(false));
  }

  return (
    <form onSubmit={onSubmit} className="rounded-card bg-white p-3 shadow-lift sm:p-4">
      <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Where</span>
          <TextInput value={query.location} placeholder="City, region, or country" autoComplete="off" onChange={(event) => setQuery({ ...query, location: event.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Check in</span>
          <TextInput type="date" value={query.checkIn} onChange={(event) => setQuery({ ...query, checkIn: event.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Check out</span>
          <TextInput type="date" value={query.checkOut} min={query.checkIn || undefined} onChange={(event) => setQuery({ ...query, checkOut: event.target.value })} />
        </label>
        <div className="relative text-sm" ref={guestsRef}>
          <span className="mb-1.5 block font-medium">Guests</span>
          <button type="button" className="h-11 w-full rounded-[10px] border border-[#D9D3C7] bg-white px-3.5 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {summary}
          </button>
          {open ? (
            <div className="absolute left-0 right-0 z-40 mt-2 space-y-2 rounded-[10px] border border-[#D9D3C7] bg-white p-3 shadow-lift">
              <Stepper label="Adults" value={query.adults} min={1} onChange={(adults) => setQuery({ ...query, adults })} />
              <Stepper label="Children" value={query.children} min={0} onChange={(children) => setQuery({ ...query, children })} />
              <Stepper label="Infants" value={query.infants} min={0} onChange={(infants) => setQuery({ ...query, infants })} />
              <div className="flex items-center justify-between gap-3 py-1">
                <span>Pets</span>
                <button type="button" role="switch" aria-checked={query.pets} className={`relative h-6 w-11 rounded-full ${query.pets ? "bg-primary" : "bg-[#D9D3C7]"}`} onClick={() => setQuery({ ...query, pets: !query.pets })}>
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white ${query.pets ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <Button type="submit" loading={loading} loadingLabel="Searching..." className="w-full lg:w-auto">
          <Search className="size-4" aria-hidden="true" />
          Search
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <button type="button" className="grid size-9 place-items-center rounded-[8px] border border-[#D9D3C7]" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          <Minus className="size-4" />
        </button>
        <span className="w-5 text-center tabular-nums">{value}</span>
        <button type="button" className="grid size-9 place-items-center rounded-[8px] border border-[#D9D3C7]" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(Math.min(16, value + 1))}>
          <Plus className="size-4" />
        </button>
      </span>
    </div>
  );
}
