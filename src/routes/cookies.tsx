import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/cookies")({
  component: function CookiesPage() {
    return <CmsPage slug="cookies" />;
  },
});
