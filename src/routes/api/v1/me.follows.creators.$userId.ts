import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/me/follows/creators/$userId")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { handlePutCreatorFollow } = await import("@/server/http/library");
        return handlePutCreatorFollow(request, params.userId);
      },
      DELETE: async ({ request, params }) => {
        const { handleDeleteCreatorFollow } = await import("@/server/http/library");
        return handleDeleteCreatorFollow(request, params.userId);
      },
    },
  },
});
