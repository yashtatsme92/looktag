const attempts = new Map<string, number[]>();

/** Hard cap so a flood of distinct keys cannot grow the limiter without bound. */
export const NATIVE_NONCE_MAX_CLIENTS = 4096;

/** Value written when a nonce is consumed. The row, and its original expiry, stay. */
export const NATIVE_NONCE_USED = "used";

export type NativeNoncePhase = "absent" | "expired" | "live" | "used";

export type NativeNonceRow = {
  value: string;
  /** Epoch milliseconds. The original expiry is kept when the row is tombstoned. */
  expiresAt: number;
};

export function nativeNonceIdentifier(nonce: string): string {
  return `native-nonce:${nonce}`;
}

/** Absent, expired, still open, or already consumed (and not yet expired). */
export function nativeNoncePhase(row: NativeNonceRow | null, now: number): NativeNoncePhase {
  if (!row) return "absent";
  if (row.expiresAt <= now) return "expired";
  if (row.value === NATIVE_NONCE_USED) return "used";
  return "live";
}

/** A nonce that still has a row — open or already used — cannot be registered again. */
export function nativeNonceRegistrationAllowed(phase: NativeNoncePhase): boolean {
  return phase === "absent" || phase === "expired";
}

/** Only an open, unexpired row can be consumed. A tombstone is not reusable. */
export function nativeNonceConsumeAllowed(phase: NativeNoncePhase): boolean {
  return phase === "live";
}

/** Mark the row used without moving its expiry. */
export function tombstoneNonce(row: NativeNonceRow): NativeNonceRow {
  return { value: NATIVE_NONCE_USED, expiresAt: row.expiresAt };
}

function pruneExpired(store: Map<string, number[]>, now: number, windowMs: number): void {
  for (const [key, stamps] of store) {
    const recent = stamps.filter((at) => now - at < windowMs);
    if (recent.length === 0) store.delete(key);
    else if (recent.length !== stamps.length) store.set(key, recent);
  }
}

/**
 * Per-client window. Returns false once `limit` attempts have landed inside
 * `windowMs`. Expired keys are dropped, and the map never grows past
 * `maxClients` (the oldest key is evicted to make room).
 */
export function allowNativeNonceIssue(
  key: string,
  now = Date.now(),
  limit = 60,
  windowMs = 60_000,
  store: Map<string, number[]> = attempts,
  maxClients = NATIVE_NONCE_MAX_CLIENTS,
): boolean {
  pruneExpired(store, now, windowMs);
  const recent = store.get(key);
  if (recent && recent.length >= limit) return false;
  if (!recent && store.size >= maxClients) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  const next = recent ?? [];
  next.push(now);
  store.set(key, next);
  return true;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n <= 255 && String(n) === part;
  });
}

function isIpv6(value: string): boolean {
  if (!value.includes(":")) return false;
  if (!/^[0-9a-f:]+$/.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = halves.join(":").split(":").filter((group) => group.length > 0);
  return groups.every((group) => /^[0-9a-f]{1,4}$/.test(group)) && groups.length <= 8;
}

/** Strip brackets, an IPv4 port, and IPv4-mapped IPv6. Returns null when it is not an IP. */
export function normalizeClientIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value || value.length > 128) return null;
  if (value.startsWith("[") && value.includes("]")) {
    value = value.slice(1, value.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (isIpv4(mapped)) return mapped;
  }
  if (isIpv4(lower) || isIpv6(lower)) return lower;
  return null;
}

/** Loopback and private ranges: the only peers our reverse proxy connects from. */
export function isProxyPeer(ip: string): boolean {
  if (ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true;
  if (!isIpv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function forwardedHops(header: string | null): string[] {
  if (!header) return [];
  const hops: string[] = [];
  for (const part of header.split(",")) {
    const ip = normalizeClientIp(part);
    if (ip) hops.push(ip);
  }
  return hops;
}

/**
 * Rate-limit key.
 *
 * `X-Forwarded-For` is client-controlled except for the single address our
 * reverse proxy appends (the peer that proxy accepted). That appended hop is
 * trusted only when the TCP peer is the proxy itself. Otherwise the header is
 * ignored and the socket address is used.
 */
export function nativeNonceClientKey(input: {
  forwardedFor: string | null;
  socketAddress?: string | null;
}): string {
  const socket = normalizeClientIp(input.socketAddress);
  const hops = forwardedHops(input.forwardedFor);
  if (socket && isProxyPeer(socket) && hops.length > 0) return hops[hops.length - 1];
  return socket ?? "direct";
}
