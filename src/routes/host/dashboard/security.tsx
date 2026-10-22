import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/workspace";
import { SecurityPanel } from "@/components/security-panel";

export const Route = createFileRoute("/host/dashboard/security")({
  component: function HostSecurity() {
    return (
      <>
        <PageIntro title="Security" body="Add an authenticator app. You'll be asked for a code after your password." />
        <SecurityPanel />
      </>
    );
  },
});
