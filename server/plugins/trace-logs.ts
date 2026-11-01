import { activeSpan } from "../../src/lib/observability/active-span.ts";

/** Append the active trace to server logs so a line can be found in Tempo. */
export default function traceLogPlugin(): void {
  const globalRef = globalThis as typeof globalThis & { __looktagTraceLogs?: boolean };
  if (globalRef.__looktagTraceLogs) return;
  globalRef.__looktagTraceLogs = true;
  for (const level of ["error", "warn", "info"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      const span = activeSpan();
      if (!span || args.some((arg) => hasTrace(arg))) {
        original(...args);
        return;
      }
      original(...args, { trace_id: span.traceId, span_id: span.spanId });
    };
  }
}

function hasTrace(arg: unknown): boolean {
  if (!arg || typeof arg !== "object") return false;
  if ("trace_id" in arg) return true;
  if (typeof arg === "string") return false;
  return false;
}
