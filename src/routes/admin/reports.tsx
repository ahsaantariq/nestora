import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { downloadBookingsCsv } from "@/lib/nestora/functions";
import { PageIntro } from "@/components/workspace";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/admin/reports")({ component: ReportsPage });

function ReportsPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function exportCsv() {
    setPending(true);
    setError(null);
    try {
      const csv = await downloadBookingsCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nestora-bookings.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageIntro title="Reports" body="Export bookings as CSV. If nobody has booked, the file is the header row only — not sample rows." />
      <Button type="button" onClick={() => void exportCsv()} loading={pending} loadingLabel="Preparing...">
        Export bookings CSV
      </Button>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </>
  );
}
