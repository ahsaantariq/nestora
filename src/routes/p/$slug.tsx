import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/p/$slug")({
  component: function CustomPage() {
    const { slug } = Route.useParams();
    return <CmsPage slug={slug} />;
  },
});
