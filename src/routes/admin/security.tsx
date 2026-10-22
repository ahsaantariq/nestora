import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/workspace";
import { SecurityPanel } from "@/components/security-panel";

export const Route = createFileRoute("/admin/security")({
  component: function AdminSecurity() {
    return (
      <>
        <PageIntro title="Security" body="Protect the admin account with an authenticator app." />
        <SecurityPanel />
      </>
    );
  },
});
