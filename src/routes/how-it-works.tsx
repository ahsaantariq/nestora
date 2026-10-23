import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/how-it-works")({
  component: function HowItWorksPage() {
    return <CmsPage slug="how-it-works" />;
  },
});
