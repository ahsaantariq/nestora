import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { saveProfile } from "@/lib/nestora/functions";
import { roleLabel } from "@/lib/nestora/constants";
import { useProfile } from "@/components/profile-context";
import { PageIntro } from "@/components/workspace";
import { Button, TextInput } from "@/components/ui";

export const Route = createFileRoute("/dashboard/profile")({ component: ProfilePage });

function ProfilePage() {
  const { profile, reload } = useProfile();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.displayName);
    setPhone(profile.phone ?? "");
  }, [profile]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await saveProfile({ data: { displayName: name, phone } });
      reload();
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  if (!profile) return null;
  return (
    <>
      <PageIntro title="Profile" body="This is the name hosts see. Your email comes from your sign-in and isn't edited here." />
      <form onSubmit={onSubmit} className="max-w-md space-y-4 rounded-card bg-surface p-5 shadow-soft">
        <p className="text-sm text-muted">{profile.email} · {roleLabel(profile.role)}</p>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Name</span>
          <TextInput value={name} required onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Phone</span>
          <TextInput value={phone} autoComplete="tel" onChange={(event) => setPhone(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {saved ? <p className="text-sm text-success">Saved.</p> : null}
        <Button type="submit" loading={pending} loadingLabel="Saving...">Save profile</Button>
      </form>
    </>
  );
}
