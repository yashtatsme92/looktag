/** Anonymous browser ingest: 60 requests per minute per client. */
export const INGEST_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;

type Bucket = { start: number; count: number };

/** `TRUST_PROXY=1` on Render. Off by default so a client cannot pick its own bucket. */
export function trustProxyFromEnv(env: { TRUST_PROXY?: string } | NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.TRUST_PROXY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * When `TRUST_PROXY` is on (Render), the client is the first X-Forwarded-For hop.
 * Otherwise the socket address, so a spoofed header cannot split or share the bucket.
 */
export function resolveClientIp(input: {
  trustProxy: boolean;
  forwardedFor?: string | null;
  socketIp?: string | null;
}): string {
  if (input.trustProxy) {
    const hop = input.forwardedFor?.split(",")[0]?.trim() ?? "";
    if (hop) return hop.slice(0, 64);
  }
  const socket = input.socketIp?.trim() ?? "";
  return socket.slice(0, 64) || "unknown";
}

export class IngestRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(limit = INGEST_PER_MINUTE, windowMs = WINDOW_MS, maxKeys = MAX_KEYS, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.now = now;
  }

  allow(ip: string): boolean {
    const key = (ip || "unknown").trim().slice(0, 64) || "unknown";
    const now = this.now();
    this.evict(now);
    const current = this.buckets.get(key);
    if (!current || now - current.start >= this.windowMs) {
      if (!this.buckets.has(key)) {
        while (this.buckets.size >= this.maxKeys) {
          const oldest = this.buckets.keys().next().value;
          if (oldest === undefined) break;
          this.buckets.delete(oldest);
        }
      }
      this.buckets.set(key, { start: now, count: 1 });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  get size(): number {
    return this.buckets.size;
  }

  private evict(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.start >= this.windowMs) this.buckets.delete(key);
    }
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}

export const clientIngestLimiter = new IngestRateLimiter();
