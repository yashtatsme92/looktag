const attempts = new Map<string, number[]>();

export function nativeNonceIdentifier(nonce: string): string {
  return `native-nonce:${nonce}`;
}

/**
 * Per-client window. Returns false once `limit` attempts have landed inside
 * `windowMs`. Expired rows are the caller's job; this only throttles issues.
 */
export function allowNativeNonceIssue(
  key: string,
  now = Date.now(),
  limit = 60,
  windowMs = 60_000,
  store: Map<string, number[]> = attempts,
): boolean {
  const recent = (store.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}

export function nativeNonceClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "direct";
}
