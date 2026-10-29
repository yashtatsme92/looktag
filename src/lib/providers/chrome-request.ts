import { createServerFn } from "@tanstack/react-start";
import { resolvePlatformChrome, type PlatformChrome } from "./chrome";

/** Request host decides chrome. The client reads data-platform instead. */
export const readRequestChrome = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ platformChrome: PlatformChrome; ogImage: string }> => {
    let host = "";
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    } catch {
      host = "";
    }
    const platformChrome = resolvePlatformChrome(process.env, host);
    const origin = (process.env.APP_URL ?? "").trim().replace(/\/$/, "");
    return {
      platformChrome,
      ogImage: platformChrome === "none" ? (origin ? `${origin}/og.jpg` : "/og.jpg") : "",
    };
  },
);
