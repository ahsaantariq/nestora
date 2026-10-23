import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadNavAdminFn, saveContactDetailsFn, saveNavigationFn } from "@/lib/nestora/content.fns";
import { PageIntro } from "@/components/workspace";
import { SelectField, TextField, ToggleField } from "@/components/forms";
import { Button, Skeleton } from "@/components/ui";

export const Route = createFileRoute("/admin/navigation")({ component: NavigationAdmin });

type LinkRow = {
  id: string;
  placement: "HEADER" | "FOOTER";
  columnName: string;
  label: string;
  href: string;
  sortOrder: number;
  visible: boolean;
};

function NavigationAdmin() {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNavAdminFn().then((next) => {
      setLinks(next.links.map((link) => ({
        id: link.id,
        placement: link.placement === "HEADER" ? "HEADER" : "FOOTER",
        columnName: link.column_name,
        label: link.label,
        href: link.href,
        sortOrder: link.sort_order,
        visible: link.visible,
      })));
      setEmail(next.contact.email);
      setPhone(next.contact.phone);
      setAddress(next.contact.address);
      setHours(next.contact.hours);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load navigation."));
  }, []);

  function patch(id: string, partial: Partial<LinkRow>) {
    setLinks((current) => current?.map((link) => (link.id === id ? { ...link, ...partial } : link)) ?? current);
  }

  if (!links && !error) return <Skeleton className="h-24" />;

  return (
    <>
      <PageIntro title="Navigation" body="Header and footer links, plus the contact details on the contact page. Changes show on the next page load." />
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <div className="mb-4 flex gap-2">
        <Button loading={saving} loadingLabel="Saving..." onClick={() => {
          if (!links) return;
          setSaving(true);
          saveNavigationFn({ data: { links: links.map((link, index) => ({ ...link, sortOrder: index })) } })
            .then(() => toast.success("Navigation saved"))
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not save."))
            .finally(() => setSaving(false));
        }}>Save navigation</Button>
        <Button variant="quiet" onClick={() => setLinks((current) => [...(current ?? []), { id: crypto.randomUUID(), placement: "FOOTER", columnName: "Company", label: "New link", href: "/", sortOrder: current?.length ?? 0, visible: true }])}>Add link</Button>
      </div>
      <ul className="space-y-3">
        {links?.map((link) => (
          <li key={link.id} className="grid gap-3 rounded-card bg-surface p-4 shadow-soft md:grid-cols-2">
            <TextField label="Label" value={link.label} onChange={(label) => patch(link.id, { label })} />
            <TextField label="URL" value={link.href} onChange={(href) => patch(link.id, { href })} />
            <SelectField label="Place" value={link.placement} onChange={(placement) => patch(link.id, { placement: placement === "HEADER" ? "HEADER" : "FOOTER" })} options={[{ value: "HEADER", label: "Header" }, { value: "FOOTER", label: "Footer" }]} />
            <TextField label="Footer column" value={link.columnName} onChange={(columnName) => patch(link.id, { columnName })} hint="Company, Guests, Hosts, or Legal. Header links can leave this blank." />
            <ToggleField label="Visible" checked={link.visible} onChange={(visible) => patch(link.id, { visible })} />
            <Button variant="danger" onClick={() => setLinks((current) => current?.filter((item) => item.id !== link.id) ?? current)}>Remove</Button>
          </li>
        ))}
      </ul>
      <form className="mt-10 max-w-xl space-y-3" onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        saveContactDetailsFn({ data: { email, phone, address, hours } })
          .then(() => toast.success("Contact details saved"))
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not save contact details."))
          .finally(() => setSaving(false));
      }}>
        <h2 className="font-display text-2xl">Contact details</h2>
        <TextField label="Email" value={email} onChange={setEmail} />
        <TextField label="Phone" value={phone} onChange={setPhone} />
        <TextField label="Address" value={address} onChange={setAddress} />
        <TextField label="Hours" value={hours} onChange={setHours} />
        <Button type="submit" loading={saving} loadingLabel="Saving...">Save contact details</Button>
      </form>
    </>
  );
}
