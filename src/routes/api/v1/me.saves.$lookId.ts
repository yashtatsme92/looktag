import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/me/saves/$lookId")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const { handlePutSave } = await import("@/server/http/library");
        return handlePutSave(request, params.lookId);
      },
      DELETE: async ({ request, params }) => {
        const { handleDeleteSave } = await import("@/server/http/library");
        return handleDeleteSave(request, params.lookId);
      },
    },
  },
});
