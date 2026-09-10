/**
 * Quotas and input guards for AI / shop-search server functions.
 * Pure module (no request imports) so unit tests can drive it directly.
 */

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(message = "Too many AI searches. Try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Thrown when a caller reaches AI search without a verified user id.
 * Same contract as `UnauthorizedError` in `verify.server.ts` (`message === "Unauthorized"`,
 * `status: 401`) so clients already using `isUnauthorized` keep working.
 */
export class AiSearchUnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export const AI_SEARCH_LIMITS = {
  /** Rolling hourly budget per authenticated user. */
  userPerHour: 30,
  /** Calendar-day budget per authenticated user (UTC window). */
  userPerDay: 100,
  /** Rolling hourly budget per client IP (when available). */
  ipPerHour: 60,
  /** Max `data:` URL length accepted for vision calls (chars). */
  maxImageDataUrlChars: 3_500_000,
} as const;

export type AiSearchKind = "suggestPieces" | "suggestShops" | "searchPin";

/** Relative cost against the shared quota (vision burns more xAI). */
export function aiSearchCost(kind: AiSearchKind): number {
  if (kind === "suggestPieces") return 3;
  if (kind === "searchPin") return 2;
  return 1;
}

type Bucket = { count: number; resetAt: number };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const userHourly = new Map<string, Bucket>();
const userDaily = new Map<string, Bucket>();
const ipHourly = new Map<string, Bucket>();

function bump(
  store: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
  cost: number,
  now: number,
): void {
  let bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }
  if (bucket.count + cost > limit) {
    throw new RateLimitError();
  }
  bucket.count += cost;
}

/**
 * Consume quota for one AI/search call. Throws `RateLimitError` (429) when
 * the user or IP would exceed configured budgets.
 */
export function consumeAiSearchQuota(opts: {
  userId: string;
  ip?: string;
  cost?: number;
  now?: number;
}): void {
  const userId = opts.userId.trim();
  if (!userId) throw new AiSearchUnauthorizedError();
  const cost = Math.max(1, opts.cost ?? 1);
  const now = opts.now ?? Date.now();
  bump(userHourly, `u:${userId}`, AI_SEARCH_LIMITS.userPerHour, HOUR_MS, cost, now);
  bump(userDaily, `ud:${userId}`, AI_SEARCH_LIMITS.userPerDay, DAY_MS, cost, now);
  const ip = opts.ip?.trim();
  if (ip) {
    bump(ipHourly, `ip:${ip}`, AI_SEARCH_LIMITS.ipPerHour, HOUR_MS, cost, now);
  }
}

/** Clear in-memory counters (tests only). */
export function resetAiSearchQuotaForTests(): void {
  userHourly.clear();
  userDaily.clear();
  ipHourly.clear();
}

/**
 * Defense-in-depth after `authMiddleware`: refuse empty/missing user ids with 401.
 */
export function requireAiSearchUserId(userId: string | undefined | null): string {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) throw new AiSearchUnauthorizedError();
  return id;
}

/**
 * Reject non-image or oversized vision payloads before they hit xAI.
 * Returns the data URL when acceptable, otherwise `null`.
 */
export function clampImageDataUrl(dataUrl: string | undefined | null): string | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  if (!dataUrl.startsWith("data:image/")) return null;
  if (dataUrl.length > AI_SEARCH_LIMITS.maxImageDataUrlChars) return null;
  return dataUrl;
}
