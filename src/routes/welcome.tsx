import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { claimWelcomeFn } from "@/lib/nestora/assistant.fns";
import { PublicFrame } from "@/components/site-chrome";
import { AsyncForm, TextField } from "@/components/forms";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/welcome")({
  validateSearch: (search: Record<string, unknown>) => ({ token: typeof search.token === "string" ? search.token : "" }),
  component: WelcomePage,
});

function WelcomePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <PublicFrame>
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="font-display text-4xl">Set your password</h1>
        <p className="mt-2 text-sm text-muted">This also confirms the email on your Nestora account.</p>
        <AsyncForm className="mt-6 space-y-4" onSubmit={async () => {
          setError(null);
          const result = await claimWelcomeFn({ data: { token, password } });
          await navigate({ to: result.bookingId ? "/trips/$bookingId" : "/dashboard", params: result.bookingId ? { bookingId: result.bookingId } : undefined });
        }}>
          {(busy) => (
            <>
              <TextField label="Password" type="password" required value={password} onChange={setPassword} />
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" loading={busy} loadingLabel="Saving..." onClick={() => setError(null)}>Save and view booking</Button>
            </>
          )}
        </AsyncForm>
      </div>
    </PublicFrame>
  );
}
