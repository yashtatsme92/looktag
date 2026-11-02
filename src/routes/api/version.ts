import { createFileRoute } from "@tanstack/react-router";
import { appBuiltAt, appCommit, appVersion } from "@/lib/build-info";

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({ version: appVersion, commit: appCommit, builtAt: appBuiltAt }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        ),
    },
  },
});
