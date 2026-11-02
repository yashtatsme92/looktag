import { formatTraceparent } from "./model.ts";
import { currentClientSpan, startSpan } from "./runtime.ts";

export function installTraceparentFetch(): {
  restore: () => void;
  withoutSpan: <T>(fn: () => Promise<T>) => Promise<T>;
} {
  const originalFetch = window.fetch;
  let suppressedSpans = 0;
  const tracedFetch: typeof window.fetch = async (input, init) => {
    const parent = currentClientSpan();
    if (!parent || suppressedSpans > 0) return originalFetch.call(window, input, init);

    let url: URL;
    try {
      const requestUrl = input instanceof Request ? input.url : String(input);
      url = new URL(requestUrl, window.location.href);
    } catch {
      return originalFetch.call(window, input, init);
    }
    if (url.origin !== window.location.origin) return originalFetch.call(window, input, init);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const span = startSpan("http.client", {
      kind: "CLIENT",
      attributes: { "http.request.method": method, "url.path": url.pathname },
    });
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set("traceparent", formatTraceparent(span));
    try {
      const response = await originalFetch.call(window, input, { ...init, headers });
      span.setAttribute("http.response.status_code", response.status);
      span.end();
      return response;
    } catch (error) {
      span.end(error);
      throw error;
    }
  };
  window.fetch = tracedFetch;
  return {
    restore() {
      if (window.fetch === tracedFetch) window.fetch = originalFetch;
    },
    async withoutSpan<T>(fn: () => Promise<T>): Promise<T> {
      suppressedSpans += 1;
      try {
        return await fn();
      } finally {
        suppressedSpans -= 1;
      }
    },
  };
}
