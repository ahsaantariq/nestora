import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/list")({
  beforeLoad: () => {
    throw redirect({ to: "/host" });
  },
});
