import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/host/listing/$propertyId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/host/dashboard/listing/$propertyId", params });
  },
});
