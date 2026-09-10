import type { Attributes, SpanKindName } from "./model";
import { flushSignals, withSpan as runSpan, type SpanRecorder } from "./runtime";

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
    return runSpan(
      name,
      (span) => spanParent.run({ traceId: span.traceId, spanId: span.spanId }, () => fn(span)),
      {
        kind: options?.kind,
        attributes: options?.attributes,
        traceId: parent?.traceId,
        parentSpanId: parent?.spanId,
      },
    );
  }
  return runSpan(name, fn, options);
}
