import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/reviews")({
  beforeLoad: () => {
    throw redirect({ to: "/host/dashboard/reviews" });
  },
});
