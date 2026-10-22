import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Minus, Plus, Star } from "lucide-react";
import { Button, Field, SelectInput, TextArea, TextInput, controlClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export function useAsyncAction<T extends unknown[]>(fn: (...args: T) => Promise<unknown>) {
  const [loading, setLoading] = useState(false);
  async function run(...args: T) {
    if (loading) return;
    setLoading(true);
    try {
      return await fn(...args);
    } finally {
      setLoading(false);
    }
  }
  return { loading, run };
}

export function AsyncForm({
  className,
  onSubmit,
  children,
}: {
  className?: string;
  onSubmit: () => Promise<void>;
  children: (busy: boolean) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  async function handle(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit();
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void handle(event)} className={className}>
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0 disabled:opacity-80">
        {children(busy)}
      </fieldset>
    </form>
  );
}

export function FormSection({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-[#E7E2D9] bg-white p-5 shadow-soft">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <Field label={props.label} required={props.required} hint={props.hint} error={props.error}>
      <TextInput
        type={props.type}
        required={props.required}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        value={props.value}
        aria-invalid={props.error ? true : undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
  );
}

export function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  hint?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <Field label={props.label} required={props.required} hint={props.hint}>
      <TextArea
        required={props.required}
        maxLength={props.maxLength}
        rows={props.rows}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.maxLength ? (
        <span className="block text-right text-xs text-muted">
          {props.value.length}/{props.maxLength}
        </span>
      ) : null}
    </Field>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <Field label={props.label} required={props.required} hint={props.hint}>
      <SelectInput required={props.required} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}

export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 50,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className={cn(controlClass, "flex items-center justify-between px-1.5")}>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-[8px] hover:bg-bg disabled:opacity-40"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
        >
          <Minus className="size-4" />
        </button>
        <span className="tabular-nums">{value}</span>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-[8px] hover:bg-bg disabled:opacity-40"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
        >
          <Plus className="size-4" />
        </button>
      </div>
    </Field>
  );
}

export function StarRating({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <Field label={label} hint="Click a star. Click the same star again to clear.">
      <div className="flex h-11 items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            className="grid size-9 place-items-center"
            onClick={() => onChange(value === star ? null : star)}
          >
            <Star className={cn("size-5", value != null && star <= value ? "fill-accent text-accent" : "text-[#D9D3C7]")} />
          </button>
        ))}
      </div>
    </Field>
  );
}

export function PriceField({
  label,
  cents,
  onChange,
  allowEmpty,
  hint,
}: {
  label: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  allowEmpty?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
        <TextInput
          className="pl-8"
          inputMode="decimal"
          value={cents == null ? "" : (cents / 100).toFixed(2)}
          onChange={(event) => {
            if (allowEmpty && event.target.value.trim() === "") {
              onChange(null);
              return;
            }
            const amount = Number(event.target.value);
            onChange(Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0);
          }}
        />
      </div>
    </Field>
  );
}

export function ToggleField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-[10px] border border-[#D9D3C7] bg-white px-3.5 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-primary" : "bg-[#D9D3C7]")}
        onClick={() => onChange(!checked)}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-transform", checked ? "left-5" : "left-0.5")} />
      </button>
    </div>
  );
}

export function ChoiceCards({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  return (
    <fieldset className="md:col-span-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className={cn("flex cursor-pointer gap-3 rounded-[10px] border bg-white p-3", value === option.value ? "border-primary ring-2 ring-primary/20" : "border-[#D9D3C7]")}>
            <input type="radio" className="mt-1 accent-primary" checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>
              <span className="block text-sm font-medium">{option.label}</span>
              {option.hint ? <span className="block text-xs text-muted">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const AMENITY_ICON: Record<string, string> = {
  Wifi: "⌁",
  Kitchen: "⌂",
  Washer: "◌",
  Dryer: "◍",
  "Air conditioning": "❄",
  Heating: "♨",
  Workspace: "✎",
  Pool: "≈",
  "Hot tub": "♨",
  "Free parking": "P",
  "EV charger": "⚡",
  "Self check-in": "⌖",
  Elevator: "↕",
  Crib: "◡",
};

export function AmenityPicker({ value, onChange, options }: { value: string[]; onChange: (value: string[]) => void; options: readonly string[] }) {
  return (
    <fieldset className="md:col-span-2">
      <legend className="mb-2 text-sm font-medium">Amenities</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((amenity) => {
          const on = value.includes(amenity);
          return (
            <label key={amenity} className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border bg-white px-3 text-sm", on ? "border-primary ring-2 ring-primary/15" : "border-[#D9D3C7]")}>
              <input
                type="checkbox"
                className="accent-primary"
                checked={on}
                onChange={() => onChange(on ? value.filter((item) => item !== amenity) : [...value, amenity])}
              />
              <span aria-hidden="true" className="w-4 text-center text-primary">{AMENITY_ICON[amenity] ?? "•"}</span>
              {amenity}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function DateField({ label, value, onChange, min }: { label: string; value: string; onChange: (value: string) => void; min?: string }) {
  return (
    <Field label={label}>
      <TextInput type="date" value={value} min={min} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

export function PlaceSearch({
  onPick,
}: {
  onPick: (place: { label: string; lat: number; lng: number }) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const text = query.trim();
    if (text.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const { placeSearchFn } = await import("@/lib/nestora/functions");
      const next = await placeSearchFn({ data: { query: text } });
      setHits(next);
      if (next.length === 0) setError("No places matched that search.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Place search failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="md:col-span-2 space-y-2">
      <Field label="Find the address" hint="Search, then pick a result to drop the map pin.">
        <div className="flex gap-2">
          <TextInput value={query} placeholder="Street, city, or landmark" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} />
          <Button type="button" variant="quiet" loading={busy} loadingLabel="Searching..." onClick={() => void search()}>Search</Button>
        </div>
      </Field>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {hits.length > 0 ? (
        <ul className="overflow-hidden rounded-[10px] border border-[#D9D3C7] bg-white">
          {hits.map((hit) => (
            <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => { onPick(hit); setHits([]); }}>
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" role="presentation" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-card bg-white p-6 shadow-lift"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-display text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" type="button" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" type="button" loading={loading} loadingLabel="Working..." onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const id = useId();
  const [state, setState] = useState<{ title: string; body: string; confirmLabel?: string; run: () => Promise<void> } | null>(null);
  const [loading, setLoading] = useState(false);
  return {
    id,
    dialog: (
      <ConfirmDialog
        open={Boolean(state)}
        title={state?.title ?? ""}
        body={state?.body ?? ""}
        confirmLabel={state?.confirmLabel}
        loading={loading}
        onCancel={() => { if (!loading) setState(null); }}
        onConfirm={() => {
          if (!state || loading) return;
          setLoading(true);
          state.run().finally(() => {
            setLoading(false);
            setState(null);
          });
        }}
      />
    ),
    ask(title: string, body: string, run: () => Promise<void>, confirmLabel = "Delete") {
      setState({ title, body, run, confirmLabel });
    },
  };
}
