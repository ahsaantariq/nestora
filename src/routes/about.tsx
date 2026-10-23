import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/about")({
  component: function AboutPage() {
    return <CmsPage slug="about" />;
  },
});
