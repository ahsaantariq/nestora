import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/cancellation")({
  component: function CancellationPage() {
    return <CmsPage slug="cancellation" />;
  },
});
