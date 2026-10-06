import { createFileRoute } from "@tanstack/react-router";
import { FeedAdmin } from "@/components/admin/feed-admin";
import { AdminGate } from "@/components/admin/admin-gate";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/admin_/feed")({ component: AdminFeedPage });

function AdminFeedPage() {
  return (
    <AdminGate>
      <AppShell title="Feed & discovery" backTo="/admin">
        <FeedAdmin />
      </AppShell>
    </AdminGate>
  );
}
