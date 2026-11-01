const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export type TraceParent = {
  traceId: string;
  spanId: string;
  flags: string;
};

/** W3C traceparent. Invalid, all-zero, or non-00 versions are ignored. */
export function parseTraceparent(header: string | null | undefined): TraceParent | null {
  if (!header) return null;
  const match = TRACEPARENT.exec(header.trim());
  if (!match) return null;
  const traceId = match[1].toLowerCase();
  const spanId = match[2].toLowerCase();
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return { traceId, spanId, flags: match[3].toLowerCase() };
}

export function formatTraceparent(parent: { traceId: string; spanId: string; flags?: string }): string {
  const flags = (parent.flags ?? "01").toLowerCase();
  return `00-${parent.traceId.toLowerCase()}-${parent.spanId.toLowerCase()}-${flags}`;
}
