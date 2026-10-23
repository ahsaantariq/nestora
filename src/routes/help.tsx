import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/help")({
  component: function HelpPage() {
    return <CmsPage slug="help" />;
  },
});
