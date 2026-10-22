import { assertProviderEnv } from "./assert-env.ts";
import { refuseEphemeralDatabase } from "./db/refuse-ephemeral.ts";

/**
 * Validate provider env and the production database guard.
 * Call this before the process listens. A bad `*_PROVIDER` exits here,
 * not on the first request.
 */
export function bootProviders(env: NodeJS.ProcessEnv = process.env): void {
  const event = env.npm_lifecycle_event ?? "";
  if (event === "build" || event === "typecheck") return;
  try {
    assertProviderEnv(env);
    refuseEphemeralDatabase(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("src/lib/providers/boot.ts") || entry?.endsWith("src/lib/providers/boot.js")) {
  bootProviders();
}
