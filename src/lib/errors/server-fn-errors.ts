import { createMiddleware } from "@tanstack/react-start";
import { errorRef, isPublicError, toClientError } from "./public-error.ts";

type FnMeta = { name?: unknown; id?: unknown; functionName?: unknown; filename?: unknown } | undefined;

function fnLabel(meta: FnMeta): string {
  const pick = (value: unknown) => (typeof value === "string" && value ? value : "");
  return pick(meta?.name) || pick(meta?.functionName) || pick(meta?.id) || "unknown";
}

/**
 * Global (registered in `src/start.ts`) and outermost, so it also wraps the
 * auth and admin middleware and every validator. Internal errors are logged in
 * full with a reference id and a span, then replaced with a friendly message.
 * The raw message (paths, SDK and driver text) never reaches the browser.
 */
export const serverFnErrorMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      const ref = errorRef();
      const outgoing = toClientError(error, ref);
      // A PublicError that wraps an internal failure (`cause`) still gets the
      // cause logged; a plain validation PublicError does not.
      const internal = outgoing === error ? undefined : isPublicError(error) ? error.cause : error;
      if (internal === undefined) throw outgoing;
      const fn = fnLabel(serverFnMeta as FnMeta);
      try {
        const { captureException } = await import("@/lib/providers/errors");
        captureException(internal, { where: `[server-fn] ${fn} failed (ref ${ref})`, ref, fn });
        const { withSpan } = await import("@/lib/observability/instrument");
        await withSpan("looktag.server_fn.error", (span) => {
          span.setAttribute("looktag.error.ref", ref);
          span.setAttribute("looktag.server_fn", fn);
          span.recordException(internal);
        });
      } catch {
        // Reporting must never replace the masked error.
      }
      throw outgoing;
    }
  },
);
