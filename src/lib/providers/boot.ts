import { assertProviderEnv } from "./assert-env.ts";
import { refuseEphemeralDatabase } from "./db/refuse-ephemeral.ts";

/**
 * Validate provider env and the production database guard.
 * The CLI (`node src/lib/providers/boot.ts`) exits on failure so a typo never
 * listens. The server runtime logs the same message and stays up so the
 * configuration page can explain which names are missing.
 */
export function bootProviders(env: NodeJS.ProcessEnv = process.env): void {
  const event = env.npm_lifecycle_event ?? "";
  if (event === "build" || event === "typecheck") return;
  try {
    assertProviderEnv(env);
    refuseEphemeralDatabase(env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    const entry = process.argv[1]?.replaceAll("\\", "/") ?? "";
    if (entry.endsWith("src/lib/providers/boot.ts") || entry.endsWith("src/lib/providers/boot.js")) {
      process.exit(1);
    }
  }
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("src/lib/providers/boot.ts") || entry?.endsWith("src/lib/providers/boot.js")) {
  bootProviders();
}
