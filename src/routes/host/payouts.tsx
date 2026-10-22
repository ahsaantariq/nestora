import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/payouts")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/payouts" });
  },
});
