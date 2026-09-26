import { createFileRoute } from "@tanstack/react-router";
import { AdminGate, AdminHubBody } from "@/components/admin/admin-gate";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/admin")({ component: AdminHubPage });

function AdminHubPage() {
  return (
    <AdminGate>
      <AppShell title="Admin" backTo="/">
        <AdminHubBody linked />
      </AppShell>
    </AdminGate>
  );
}