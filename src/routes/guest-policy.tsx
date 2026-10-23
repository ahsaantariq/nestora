import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/guest-policy")({
  component: function GuestPolicyPage() {
    return <CmsPage slug="guest-policy" />;
  },
});
