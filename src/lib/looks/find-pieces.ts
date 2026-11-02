/**
 * "Find pieces in photo" availability (#203 Product lock a).
 * Pure so unit tests can drive every state.
 */
export type FindPiecesState = "free" | "gated" | "unavailable" | "quota";

export const FIND_PIECES_COPY = {
  gatedTitle: "Sign in to find pieces",
  unavailable: "AI find isn’t available right now.",
  quota: "AI find limit reached — try again later.",
  empty: "No pieces found — tap to pin",
  finding: "Finding…",
} as const;

export function findPiecesState(input: {
  /** null while the status call is in flight. */
  aiAvailable: boolean | null;
  authEnabled: boolean;
  signedIn: boolean;
  quotaHit: boolean;
  providerError?: boolean;
}): FindPiecesState {
  if (input.aiAvailable === false || input.providerError) return "unavailable";
  if (input.authEnabled && !input.signedIn) return "gated";
  if (input.quotaHit) return "quota";
  return "free";
}

/** Rate-limit errors from the quota guard (429 / RateLimitError message). */
export function isAiQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; name?: unknown; message?: unknown };
  if (e.status === 429 || e.name === "RateLimitError") return true;
  return typeof e.message === "string" && /too many ai searches|rate limit/i.test(e.message);
}

/**
 * Server-side "AI is not available" and raw provider failures ("Could not reach Grok.", "xAI API error 503")
 * → Unavailable helper copy. Vendor names never reach the UI (platform-agnostic).
 */
export function isAiUnavailableMessage(message: string): boolean {
  return /ai is not available|could not reach|\bapi error\b|\bgrok\b|\bxai\b/i.test(message);
}

export type SessionTapIntent = "find" | "publish" | "draft";

/**
 * Taps on Publish / Save draft / Find that land while the session is still loading are queued
 * and run once it resolves (latest tap wins, runs once).
 */
export function createSessionTapQueue() {
  let queued: SessionTapIntent | null = null;
  return {
    /** Returns true when the tap was queued (session pending) — caller must not act yet. */
    tap(intent: SessionTapIntent, sessionPending: boolean): boolean {
      if (!sessionPending) return false;
      queued = intent;
      return true;
    },
    /** Call when the session state changes; returns the intent to run now, at most once. */
    flush(sessionPending: boolean): SessionTapIntent | null {
      if (sessionPending || !queued) return null;
      const intent = queued;
      queued = null;
      return intent;
    },
  };
}
