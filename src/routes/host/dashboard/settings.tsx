import { createFileRoute, Link } from "@tanstack/react-router";
import { PageIntro } from "@/components/workspace";

export const Route = createFileRoute("/host/dashboard/settings")({
  component: function HostSettings() {
    return (
      <>
        <PageIntro title="Settings" body="Your name, phone, and sign-in live on your profile. Payout bank details live under Payouts." />
        <Link to="/dashboard/profile" className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-surface">
          Edit profile
        </Link>
      </>
    );
  },
});
