/**
 * Error messages that are safe to show a person.
 *
 * Server functions throw `PublicError` for anything the user can act on
 * ("Give the look a name."). Every other error is treated as internal: the
 * global server-function middleware (`server-fn-errors.ts`) logs it with a
 * reference id and replaces it with a friendly message before it leaves the
 * server. Isomorphic: no server-only imports here.
 */

export const FRIENDLY_ERRORS = {
  generic: "Something went wrong on our side. Please try again in a moment.",
  photoUpload: "We couldn't upload your photo right now. Please try again in a moment.",
  offline: "We couldn't reach LookTag. Check your connection and try again.",
  invalidInput: "Some of that didn't look right. Check it and try again.",
  forbidden: "You don't have access to do that.",
  signIn: "Sign in to continue.",
} as const;

export class PublicError extends Error {
  /** Marks the message as written for people. Survives `instanceof` loss across bundles. */
  readonly expose = true;
  readonly status: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PublicError";
    this.status = options?.status ?? 400;
  }
}

/**
 * Errors whose message is already part of a client contract and safe to show
 * or branch on. `Unauthorized` drives the sign-in redirect (`isUnauthorized`).
 */
const PASS_THROUGH_NAMES = new Set([
  "PublicError",
  "UnauthorizedError",
  "RateLimitError",
  "ClientSignalIngestRateLimitError",
]);

export function isPublicError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  if ((error as { expose?: unknown }).expose === true) return true;
  if (PASS_THROUGH_NAMES.has(error.name)) return true;
  return error.message === "Unauthorized";
}

/** Non-Error throwables that frameworks use for control flow (redirect, notFound, Response). */
export function isControlFlowThrow(error: unknown): boolean {
  if (error instanceof Response) return true;
  if (!error || typeof error !== "object") return false;
  const value = error as { isNotFound?: unknown; isRedirect?: unknown; options?: unknown };
  return value.isNotFound === true || value.isRedirect === true;
}

/** Access errors keep a 403 meaning but get a sentence instead of "Forbidden". */
export function isForbiddenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ForbiddenError" || error.name === "CrossSiteRequestError";
}

/** Short random id that ties a user report to the server log line. */
export function errorRef(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What leaves the server for a thrown value. Public and control-flow errors
 * pass through untouched; everything else becomes a friendly `PublicError`.
 */
export function toClientError(error: unknown, ref: string): unknown {
  if (isControlFlowThrow(error)) return error;
  if (isPublicError(error)) {
    // The serializer would ship `cause` (the raw SDK / driver error) to the
    // browser. Send a copy with the same message and no cause.
    if (error.cause === undefined) return error;
    const status = (error as { status?: unknown }).status;
    return new PublicError(error.message, { status: typeof status === "number" ? status : 500 });
  }
  if (isForbiddenError(error)) return new PublicError(FRIENDLY_ERRORS.forbidden, { status: 403 });
  const masked = new PublicError(FRIENDLY_ERRORS.generic, { status: 500 });
  (masked as PublicError & { ref?: string }).ref = ref;
  return masked;
}
