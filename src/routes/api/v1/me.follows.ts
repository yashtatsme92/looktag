import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/me/follows")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleListFollows } = await import("@/server/http/library");
        return handleListFollows(request);
      },
    },
  },
});
