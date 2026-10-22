import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/host")({
  component: function HostRoot() {
    return <Outlet />;
  },
});
