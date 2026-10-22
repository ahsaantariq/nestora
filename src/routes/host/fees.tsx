import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/fees")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/fees" });
  },
});
