import { resolveAuthProvider } from "./resolve.ts";

/** Forged gate headers are ignored unless the grok adapter is selected. Never fetches on the default path. */
export async function identityFromRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<null | { sub: string }> {
  if (resolveAuthProvider(env) !== "grok") return null;
  const { gateIdentityFromHeaders } = await import("../../auth/gate-identity.server.ts");
  const identity = await gateIdentityFromHeaders(request.headers);
  return identity ? { sub: identity.sub } : null;
}
