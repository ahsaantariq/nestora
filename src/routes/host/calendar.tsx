import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { loadCalendar, loadOwnerProperties, saveCalendarDay } from "@/lib/nestora/functions";
import { formatMoney } from "@/lib/domain/money";
import { PageIntro } from "@/components/workspace";
import { Button, EmptyState, SelectInput, TextInput } from "@/components/ui";

export const Route = createFileRoute("/host/calendar")({ component: CalendarPage });

function CalendarPage() {
  const [properties, setProperties] = useState<Awaited<ReturnType<typeof loadOwnerProperties>> | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCalendar>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState("");

  useEffect(() => {
    loadOwnerProperties().then((rows) => {
      setProperties(rows);
      setPropertyId((current) => current || rows[0]?.id || "");
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load properties."));
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    loadCalendar({ data: { propertyId, month } })
      .then(setData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the calendar."));
  }, [propertyId, month]);

  const cells = useMemo(() => buildMonth(month), [month]);
  const byDay = new Map(data?.days.map((day) => [day.day, day]) ?? []);

  function tone(day: string) {
    const booking = data?.bookings.find((item) => day >= item.check_in && day < item.check_out);
    if (booking?.status === "CONFIRMED" || booking?.status === "CHECKED_IN") return "bg-primary text-surface";
    if (booking?.status === "PENDING") return "bg-warning/30";
    if (byDay.get(day)?.blocked) return "bg-danger/15 text-danger";
    return "bg-surface";
  }

  return (
    <>
      <PageIntro title="Calendar" body="Click a date to block it or set a custom price. Confirmed nights are teal, pending holds are gold, blocked nights are red. Checkout morning stays free." />
      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}
      {!properties ? null : properties.length === 0 ? (
        <EmptyState title="Nothing on the calendar" body="Create a listing first. This calendar only shows your properties." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <SelectInput value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
            </SelectInput>
            <TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            <TextInput inputMode="decimal" placeholder="Custom price" value={price} onChange={(event) => setPrice(event.target.value)} />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => <p key={label} className="text-center text-xs text-muted">{label}</p>)}
            {cells.map((day, index) => day ? (
              <button key={day} type="button" className={`min-h-16 rounded-button p-2 text-left text-xs ${tone(day)}`} onClick={() => {
                const current = byDay.get(day);
                const priceCents = price.trim() === "" ? current?.price_cents ?? null : Math.round(Number(price) * 100);
                saveCalendarDay({ data: { propertyId, day, blocked: !current?.blocked, priceCents: Number.isFinite(priceCents as number) ? priceCents : null } })
                  .then(() => loadCalendar({ data: { propertyId, month } }).then(setData))
                  .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not update that date."));
              }}>
                <span className="font-medium">{Number(day.slice(-2))}</span>
                {byDay.get(day)?.price_cents != null ? <span className="mt-1 block">{formatMoney(byDay.get(day)!.price_cents!)}</span> : null}
              </button>
            ) : <span key={`empty-${index}`} />)}
          </div>
          <Button variant="quiet" onClick={() => setMonth(shiftMonth(month, 1))}>Next month</Button>
        </div>
      )}
    </>
  );
}

function buildMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return [];
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}

function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, mon! - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
