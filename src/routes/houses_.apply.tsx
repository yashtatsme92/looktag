import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/houses_/apply")({
  component: function HouseApplyRedirect() {
    return <Navigate to="/house" />;
  },
});
