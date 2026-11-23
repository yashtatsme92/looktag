import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/me/merge-guest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMergeGuest } = await import("@/server/http/library");
        return handleMergeGuest(request);
      },
    },
  },
});
