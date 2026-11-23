export const GUEST_MERGE_CAP = 500;

/** Keep the first occurrence of each id, drop empties, and stop at the cap. */
export function capIds(ids: unknown, limit = GUEST_MERGE_CAP): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || id.length > 128 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

/** JSON-safe timestamp. pg and PGLite both disagree on Date vs string. */
export function isoTimestamp(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date(0).toISOString();
}
