import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/rooms")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/rooms" });
  },
});
