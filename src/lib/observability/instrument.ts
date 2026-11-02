import { parseTraceparent, type Attributes, type SpanKindName } from "./model";
import { withSpan as runSpan, type SpanRecorder } from "./runtime";

export type { SpanRecorder };

/** Server-only span wrapper: nests children onto the active parent and flushes OTLP. */
export async function withSpan<T>(
  name: string,
  fn: (span: SpanRecorder) => Promise<T> | T,
  options?: { kind?: SpanKindName; attributes?: Attributes },
): Promise<T> {
  if (import.meta.env.SSR) {
    const { ensureTelemetrySink } = await import("./store.server");
    ensureTelemetrySink();
    const { spanParent } = await import("./span-context.server");
    const parent = spanParent.getStore();
    let remoteParent = parent;
    if (!remoteParent) {
      try {
        const { getRequest } = await import("@tanstack/react-start/server");
        remoteParent = parseTraceparent(getRequest().headers.get("traceparent")) ?? undefined;
      } catch {
        remoteParent = undefined;
      }
    }
    return runSpan(
      name,
      (span) => spanParent.run({ traceId: span.traceId, spanId: span.spanId }, () => fn(span)),
      {
        kind: options?.kind,
        attributes: options?.attributes,
        traceId: remoteParent?.traceId,
        parentSpanId: remoteParent?.spanId,
      },
    );
  }
  return runSpan(name, fn, options);
}
