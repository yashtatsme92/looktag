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

/** Server-side "AI is not available" result copy → Unavailable, not a toast. */
export function isAiUnavailableMessage(message: string): boolean {
  return /ai is not available/i.test(message);
}
