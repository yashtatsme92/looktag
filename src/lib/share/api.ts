import { createServerFn } from "@tanstack/react-start";
import { withSpan } from "@/lib/observability/instrument";
import { recordMetric } from "@/lib/observability/runtime";
import {
  isCrawler,
  originFromRequestLike,
  resolveOrigin,
  surfaceFromUserAgent,
  type SharePageKind,
} from "@/lib/share-meta";

export type ShareView = {
  origin: string;
  crawler: boolean;
};

export const recordShareView = createServerFn({ method: "GET" })
  .validator((input: { kind: SharePageKind; id: string; found: boolean }) => input)
  .handler(async ({ data }) => {
    return withSpan(
      "looktag.share.page",
      async (span) => {
        let origin = resolveOrigin();
        let crawler = false;
        let surface: ReturnType<typeof surfaceFromUserAgent> = "web";
        try {
          const { getRequest, setResponseStatus } = await import("@tanstack/react-start/server");
          const request = getRequest();
          origin = originFromRequestLike(request) || origin;
          const ua = request.headers.get("user-agent") ?? "";
          crawler = isCrawler(ua);
          surface = surfaceFromUserAgent(ua);
          if (!data.found) setResponseStatus(404);
        } catch {
          // Loader still records the view if the request helper is unavailable.
        }
        span.setAttribute("looktag.share.kind", data.kind);
        span.setAttribute("looktag.share.id", data.id);
        span.setAttribute("looktag.share.found", data.found);
        span.setAttribute("looktag.share.crawler", crawler);
        span.setAttribute("looktag.share.anonymous", true);
        span.setAttribute("looktag.ui.surface", surface);
        if (origin) span.setAttribute("url.origin", origin);
        recordMetric("looktag.share.view", 1, {
          type: "counter",
          attributes: {
            "looktag.share.kind": data.kind,
            "looktag.share.found": data.found,
            "looktag.share.crawler": crawler,
            "looktag.ui.surface": surface,
          },
        });
        const view: ShareView = { origin, crawler };
        return view;
      },
      { kind: "SERVER", attributes: { "rpc.method": "recordShareView" } },
    );
  });
