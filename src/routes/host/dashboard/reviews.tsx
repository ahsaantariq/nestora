import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/workspace";
import { EmptyState } from "@/components/ui";

export const Route = createFileRoute("/host/dashboard/reviews")({
  component: function ReviewsPage() {
    return (
      <>
        <PageIntro title="Reviews" body="A guest can review after a completed stay. Scores are an average of those reviews, not a starting rating." />
        <EmptyState title="No reviews" body="None of your stays have a review yet." />
      </>
    );
  },
});
