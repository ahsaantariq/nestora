import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/settings" });
  },
});
