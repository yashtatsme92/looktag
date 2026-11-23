import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/me/follows/houses/$labelId")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { handlePutHouseFollow } = await import("@/server/http/library");
        return handlePutHouseFollow(request, params.labelId);
      },
      DELETE: async ({ request, params }) => {
        const { handleDeleteHouseFollow } = await import("@/server/http/library");
        return handleDeleteHouseFollow(request, params.labelId);
      },
    },
  },
});
