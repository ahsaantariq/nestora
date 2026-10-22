import { createFileRoute } from "@tanstack/react-router";
import { PageIntro } from "@/components/workspace";
import { SecurityPanel } from "@/components/security-panel";
import { AsyncForm, TextField } from "@/components/forms";
import { Button } from "@/components/ui";
import { deleteAccountFn } from "@/lib/nestora/functions";
import { signOut } from "@/lib/auth/client";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/security")({
  component: function CustomerSecurity() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    return (
      <>
        <PageIntro title="Security" body="Turn on an authenticator app, or close this account." />
        <SecurityPanel />
        <div className="mt-8 max-w-xl rounded-card bg-white p-5 shadow-soft">
          <h2 className="font-display text-2xl">Close account</h2>
          <p className="mt-1 text-sm text-muted">If you have bookings, the account is deactivated instead of erased.</p>
          <AsyncForm className="mt-4 space-y-4" onSubmit={async () => {
            setError(null);
            try {
              await deleteAccountFn({ data: { password } });
              await signOut("/");
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not close the account.");
            }
          }}>
            {(busy) => (
              <>
                <TextField label="Password" type="password" required value={password} onChange={setPassword} />
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                <Button type="submit" variant="danger" loading={busy} loadingLabel="Closing...">Delete account</Button>
              </>
            )}
          </AsyncForm>
        </div>
      </>
    );
  },
});
