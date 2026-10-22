import { refuseEphemeralDatabase } from "../../src/lib/providers/db/refuse-ephemeral.ts";

/** Nitro calls this while the server module loads, before it listens. */
export default function refuseEphemeralPlugin(): void {
  refuseEphemeralDatabase();
}
