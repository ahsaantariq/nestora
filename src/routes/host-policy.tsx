import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/host-policy")({
  component: function HostPolicyPage() {
    return <CmsPage slug="host-policy" />;
  },
});
