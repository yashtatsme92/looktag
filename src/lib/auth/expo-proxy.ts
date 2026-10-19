const PROVIDER_HOSTS = new Set(["accounts.google.com", "appleid.apple.com"]);

/** Block the Expo proxy before Better Auth sees it.
 *  Returns a response when the request must not be proxied, otherwise null.
 */
export function rejectExpoProxy(request: Request): Response | null {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/expo-authorization-proxy")) return null;

  const site = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (site === "cross-site" || site === "same-site") {
    return new Response("Forbidden", { status: 403 });
  }

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
    return new Response(null, { status: 302, headers: { location: authorizationURL } });
  }

  if (target.protocol !== "https:" || !PROVIDER_HOSTS.has(target.hostname)) {
    return new Response("Invalid authorizationURL", { status: 400 });
  }

  const redirectUri = target.searchParams.get("redirect_uri");
  if (redirectUri) {
    let redirect: URL;
    try {
      redirect = new URL(redirectUri);
    } catch {
      return new Response("Invalid authorizationURL", { status: 400 });
    }
    const appCallback =
      redirect.origin === url.origin && redirect.pathname.startsWith("/api/auth/callback/");
    if (redirect.protocol !== "looktag:" && !appCallback) {
      return new Response("Invalid authorizationURL", { status: 400 });
    }
  }

  return null;
}
