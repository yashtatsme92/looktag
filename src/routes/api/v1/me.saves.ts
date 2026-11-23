import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/me/saves")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleListSaves } = await import("@/server/http/library");
        return handleListSaves(request);
      },
    },
  },
});
