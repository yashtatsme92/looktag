import { createFileRoute } from "@tanstack/react-router";
import { appBuiltAt, appCommit, appVersion } from "@/lib/build-info";

/** Public deploy identity. No auth. Not cached. */
export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async () => {
        const { deploymentIdentity } = await import("@/lib/observability/identity.server");
        const deploy = deploymentIdentity();
        return new Response(
          JSON.stringify({
            version: appVersion,
            commit: appCommit,
            builtAt: appBuiltAt,
            serviceVersion: deploy.serviceVersion,
            deploymentId: deploy.deploymentId,
            gitSha: deploy.revision,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});
