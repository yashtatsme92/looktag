import { AsyncLocalStorage } from "node:async_hooks";
import type { Attributes } from "./model.ts";

export type SpanRef = {
  traceId: string;
  spanId: string;
  requestId?: string;
  /** app.* attributes copied onto child spans. */
  attributes?: Attributes;
};

/** Per-request parent span. Concurrent requests must not share a stack. */
export const spanParent = new AsyncLocalStorage<SpanRef>();

const globalRef = globalThis as typeof globalThis & { __looktagSpanParent?: AsyncLocalStorage<SpanRef> };
globalRef.__looktagSpanParent = spanParent;
