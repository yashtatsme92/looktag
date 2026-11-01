export type ActiveSpan = {
  traceId: string;
  spanId: string;
  requestId?: string;
  attributes?: Record<string, string | number | boolean>;
};

type Store = {
  traceId?: string;
  spanId?: string;
  requestId?: string;
  attributes?: Record<string, string | number | boolean>;
};

/** Set by span-context.server.ts. Safe to read from client code: it stays empty. */
export function activeSpan(): ActiveSpan | undefined {
  const als = (globalThis as { __looktagSpanParent?: { getStore?: () => Store | undefined } }).__looktagSpanParent;
  const store = als?.getStore?.();
  if (!store?.traceId || !store.spanId) return undefined;
  return {
    traceId: store.traceId,
    spanId: store.spanId,
    requestId: store.requestId,
    attributes: store.attributes,
  };
}
