import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/properties")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/properties" });
  },
});
