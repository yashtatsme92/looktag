import { getRequestURL } from "h3";
import { definePlugin } from "nitro";
import { staticCacheControl } from "../../src/lib/site/static-cache";

/**
 * Long cache for app icons, seed photos, fonts, splash art and og.jpg.
 * Skips anything that already set Cache-Control (HTML, /api no-store, hashed /assets).
 */
export default definePlugin(({ hooks }) => {
  hooks.hook("response", (response, event) => {
    const value = staticCacheControl(getRequestURL(event).pathname);
    if (!value || response.headers.has("cache-control")) return;
    response.headers.set("cache-control", value);
  });
});
