import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/calendar")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/calendar" });
  },
});
