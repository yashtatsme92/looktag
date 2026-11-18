import { COPY } from "../errors/copy.ts";

/**
 * "Find pieces in photo" availability (#203 Product lock a).
 * Pure so unit tests can drive every state.
 */
/**
 * "checking": the AI status call is still in flight. The button stays visible but inert so a tap
 * can't open the sign-in sheet (or start a search) for a feature that may turn out unavailable.
 */
export type FindPiecesState = "checking" | "free" | "gated" | "unavailable" | "quota";

export const FIND_PIECES_COPY = {
  gatedTitle: "Sign in to find pieces",
  unavailable: COPY.findUnavailable,
  quota: COPY.findQuota,
  empty: COPY.findEmpty,
  finding: "Finding…",
} as const;

export function findPiecesState(input: {
  /** null when unknown (status call failed): stays enabled. */
  aiAvailable: boolean | null;
  /** True until the first status call settles. */
  statusPending?: boolean;
  authEnabled: boolean;
  signedIn: boolean;
  quotaHit: boolean;
  providerError?: boolean;
}): FindPiecesState {
  if (input.aiAvailable === false || input.providerError) return "unavailable";
  if (input.statusPending) return "checking";
  if (input.authEnabled && !input.signedIn) return "gated";
  if (input.quotaHit) return "quota";
  return "free";
}

/** Rate-limit errors from the quota guard (429 / RateLimitError message). */
export function isAiQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; name?: unknown; message?: unknown };
  if (e.status === 429 || e.name === "RateLimitError") return true;
  return (
    typeof e.message === "string" &&
    /too many ai searches|rate limit|today's find limit|find limit reached/i.test(e.message)
  );
}

/**
 * Provider failures and the old "not available" wording still classify as unavailable.
 * The sentence a person sees is FIND_PIECES_COPY.unavailable.
 */
export function isAiUnavailableMessage(message: string): boolean {
  if (message === COPY.findUnavailable) return true;
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
