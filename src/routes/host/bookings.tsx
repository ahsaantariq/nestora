import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/bookings")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/bookings" });
  },
});
