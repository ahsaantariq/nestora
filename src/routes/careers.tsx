import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/careers")({
  component: function CareersPage() {
    return <CmsPage slug="careers" />;
  },
});
