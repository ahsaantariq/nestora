import { useEffect, useState } from "react";
import {
  beginTwoFactorFn,
  confirmTwoFactorFn,
  disableTwoFactorFn,
  regenerateBackupFn,
  securityStatusFn,
} from "@/lib/nestora/functions";
import { AsyncForm, TextField } from "@/components/forms";
import { Button } from "@/components/ui";

export function SecurityPanel({ forced = false }: { forced?: boolean }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof securityStatusFn>> | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    return securityStatusFn().then(setStatus);
  }
  useEffect(() => { void refresh(); }, []);

  function download(list: string[]) {
    const blob = new Blob([`Nestora backup codes\n\n${list.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nestora-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-xl space-y-4">
      {forced ? <p className="rounded-[10px] border border-warning bg-warning/15 px-4 py-3 text-sm">Turn on two-factor authentication before you can use the host dashboard.</p> : null}
      <p className="text-sm text-muted">{status?.enabled ? "An authenticator app is required at sign-in." : "Protect this account with an authenticator app."}</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {codes ? (
        <div className="rounded-[10px] border border-[#D9D3C7] bg-white p-4">
          <p className="text-sm font-medium">Save these backup codes. They will not be shown again.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <Button type="button" className="mt-4" variant="quiet" onClick={() => download(codes)}>Download codes</Button>
        </div>
      ) : null}
      {!status?.enabled ? (
        <AsyncForm className="space-y-4 rounded-card bg-white p-5 shadow-soft" onSubmit={async () => {
          setError(null);
          try {
            if (!setup) {
              const next = await beginTwoFactorFn({ data: { password } });
              setSetup(next);
              setMessage("Scan the code, then enter the 6-digit code from your app.");
              return;
            }
            const confirmed = await confirmTwoFactorFn({ data: { code } });
            setCodes(confirmed.backupCodes);
            setSetup(null);
            setPassword("");
            setCode("");
            setMessage("Two-factor authentication is on.");
            await refresh();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not turn on two-factor authentication.");
          }
        }}>
          {(busy) => (
            <div className="space-y-4">
              {!setup ? <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={setPassword} /> : null}
              {setup ? (
                <div className="space-y-3">
                  <img src={setup.qr} alt="Authenticator QR code" className="h-44 w-44 rounded-[10px] border border-[#D9D3C7]" />
                  <p className="text-xs text-muted">Manual key: <span className="font-mono">{setup.secret}</span></p>
                  <TextField label="6-digit code" required value={code} onChange={setCode} />
                </div>
              ) : null}
              <Button type="submit" loading={busy} loadingLabel={setup ? "Checking..." : "Preparing..."}>{setup ? "Confirm and enable" : "Set up authenticator"}</Button>
            </div>
          )}
        </AsyncForm>
      ) : (
        <div className="space-y-4 rounded-card bg-white p-5 shadow-soft">
          <TextField label="Password" type="password" value={password} onChange={setPassword} />
          <TextField label="Current code" value={code} onChange={setCode} hint="A 6-digit code or a backup code." />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="quiet" onClick={() => {
              setError(null);
              regenerateBackupFn({ data: { password, code } })
                .then((next) => { setCodes(next.backupCodes); setMessage("New backup codes replace the old ones."); })
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not regenerate codes."));
            }}>Regenerate backup codes</Button>
            <Button type="button" variant="danger" onClick={() => {
              setError(null);
              disableTwoFactorFn({ data: { password, code } })
                .then(() => { setMessage("Two-factor authentication is off."); setCodes(null); return refresh(); })
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not turn it off."));
            }}>Turn off</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TwoFactorChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-4xl">Enter your code</h1>
      <p className="mt-2 text-sm text-muted">Open your authenticator app, or use a backup code.</p>
      <AsyncForm className="mt-6 space-y-4" onSubmit={async () => {
        setError(null);
        try {
          const { verifySecondFactorFn } = await import("@/lib/nestora/functions");
          await verifySecondFactorFn({ data: { code } });
          onDone();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "That code didn't match.");
        }
      }}>
        {(busy) => (
          <>
            <TextField label="Authentication code" required value={code} onChange={setCode} />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" loading={busy} loadingLabel="Checking...">Continue</Button>
          </>
        )}
      </AsyncForm>
    </div>
  );
}
