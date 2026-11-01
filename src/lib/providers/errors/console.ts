import type { ErrorContext, ErrorUser } from "./types";

/** Default reporter. Prints to stderr and keeps the previous log shape when `where` is set. */
export function captureException(error: unknown, context?: ErrorContext): void {
  const trace = traceFields(context);
  if (typeof context?.where === "string") {
    if (trace) console.error(context.where, error, trace);
    else console.error(context.where, error);
    return;
  }
  if (trace) console.error(error, { ...context, ...trace });
  else console.error(error);
}

export function captureMessage(message: string, context?: ErrorContext): void {
  if (context && Object.keys(context).length > 0) console.error(message, context);
  else console.error(message);
}

export function setUser(_user: ErrorUser): void {
  // The console adapter has no user scope.
}

function traceFields(context?: ErrorContext): { trace_id: string; span_id: string; request_id?: string } | undefined {
  if (typeof context?.trace_id !== "string" || typeof context.span_id !== "string") return undefined;
  return {
    trace_id: context.trace_id,
    span_id: context.span_id,
    ...(typeof context.request_id === "string" ? { request_id: context.request_id } : {}),
  };
}
