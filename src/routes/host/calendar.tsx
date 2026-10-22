import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/workspace";
import { EmptyState } from "@/components/ui";

export const Route = createFileRoute("/host/calendar")({
  component: function CalendarPage() {
    return (
      <>
        <PageIntro title="Calendar" body="Booked nights, blocked dates, and a custom price for a single date. Checkout morning stays free for the next guest." />
        <EmptyState title="Nothing on the calendar" body="There are no bookings and no blocked dates on your properties. The calendar fills from real stays, not sample nights." />
      </>
    );
  },
});
