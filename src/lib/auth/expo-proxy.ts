import { isRegisteredLooktagCallback } from "./native.ts";

const PROVIDER_CALLBACK: Record<string, string> = {
  "accounts.google.com": "/api/auth/callback/google",
  "appleid.apple.com": "/api/auth/callback/apple",
};

export function crossSiteResponse(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (site === "cross-site" || site === "same-site") {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

/** Each provider host may only use its own registered callback, or a looktag:// deep link. */
export function providerRedirectMatches(target: URL, appOrigin: string): boolean {
  const expectedPath = PROVIDER_CALLBACK[target.hostname];
  if (!expectedPath) return false;
  const redirectUri = target.searchParams.get("redirect_uri");
  if (!redirectUri) return false;
  if (isRegisteredLooktagCallback(redirectUri)) return true;
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return false;
  }
  if (redirect.username !== "" || redirect.password !== "") return false;
  if (redirect.origin !== appOrigin) return false;
  if (redirect.search !== "" || redirect.hash !== "") return false;
  return redirect.pathname === expectedPath;
}

/** Block the Expo proxy before Better Auth sees it.
 *  Returns a response when the request must not be proxied, otherwise null.
 *  A 302 is only the registered looktag:// callback. The route still requires
 *  the one-time nonce, and drops any query that was passed through.
 */
export function rejectExpoProxy(request: Request): Response | null {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/expo-authorization-proxy")) return null;

  const blocked = crossSiteResponse(request);
  if (blocked) return blocked;

  if (url.searchParams.has("oauthState")) {
    return new Response("Invalid authorizationURL", { status: 400 });
  }

  const authorizationURL = url.searchParams.get("authorizationURL") ?? "";
  let target: URL;
  try {
    target = new URL(authorizationURL);
  } catch {
    return new Response("Invalid authorizationURL", { status: 400 });
  }

  if (target.protocol === "looktag:") {
    if (!isRegisteredLooktagCallback(authorizationURL)) {
      return new Response("Invalid authorizationURL", { status: 400 });
    }
    return new Response(null, { status: 302, headers: { location: authorizationURL } });
  }

  if (target.protocol !== "https:" || !providerRedirectMatches(target, url.origin)) {
    return new Response("Invalid authorizationURL", { status: 400 });
  }

  return null;
}
