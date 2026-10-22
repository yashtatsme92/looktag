import { bootProviders } from "../../src/lib/providers/boot.ts";

/** Nitro calls this while the server module loads, before it listens. */
export default function refuseEphemeralPlugin(): void {
  bootProviders();
}
