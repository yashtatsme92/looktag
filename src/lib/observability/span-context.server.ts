import { AsyncLocalStorage } from "node:async_hooks";

export type SpanRef = { traceId: string; spanId: string };

/** Per-request parent span. Concurrent requests must not share a stack. */
export const spanParent = new AsyncLocalStorage<SpanRef>();
