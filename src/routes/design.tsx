import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/design")({
  component: () => <Navigate to="/admin/look" />,
});
