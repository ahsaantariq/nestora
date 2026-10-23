import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/safety")({
  component: function SafetyPage() {
    return <CmsPage slug="safety" />;
  },
});
