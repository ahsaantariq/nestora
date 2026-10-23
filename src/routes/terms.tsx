import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/terms")({
  component: function TermsPage() {
    return <CmsPage slug="terms" />;
  },
});
