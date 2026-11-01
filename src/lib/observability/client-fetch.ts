/** Marks a browser telemetry upload. The production server-fn URL is `/_serverFn/<id>` and does not contain the function name. */
export const TELEMETRY_REQUEST_HEADER = "x-looktag-telemetry";

export function telemetryFunctionPath(serverFnUrl: string | null | undefined, base: string): string | null {
  if (!serverFnUrl) return null;
  try {
    return new URL(serverFnUrl, base).pathname;
  } catch {
    return null;
  }
}

type HeaderLookup = { get(name: string): string | null };

/**
 * Telemetry transport is never a span. Identity is a request flag, the
 * in-flight flush, or the resolved server-fn path — not a search for the
 * function name, which is absent from production URLs.
 */
export function isTelemetryTransport(input: {
  pathname: string;
  headers: HeaderLookup;
  telemetryPathname: string | null;
  insideFlush: boolean;
}): boolean {
  if (input.insideFlush) return true;
  if (input.headers.get(TELEMETRY_REQUEST_HEADER) === "1") return true;
  if (input.telemetryPathname && input.pathname === input.telemetryPathname) return true;
  return false;
}

/** 4xx and 5xx are errors. `error.type` is the status code. */
export function applyClientHttpStatus(
  status: number,
  span: {
    setAttribute: (key: string, value: string | number | boolean) => void;
    setStatus: (status: "ERROR" | "OK", message?: string) => void;
  },
): void {
  span.setAttribute("http.status_code", status);
  if (status >= 400) {
    span.setStatus("ERROR", `HTTP ${status}`);
    span.setAttribute("error.type", String(status));
  }
}
