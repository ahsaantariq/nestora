import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/workspace";
import { EmptyState } from "@/components/ui";

export const Route = createFileRoute("/host/rooms")({
  component: function RoomsPage() {
    return (
      <>
        <PageIntro title="Rooms and units" body="Hotels keep room types here: quantity, price, capacity, beds, and photos. Whole homes don't need them." />
        <EmptyState title="No room types" body="Room types attach to a hotel you own. You don't have one saved yet, so this list is empty." />
      </>
    );
  },
});
