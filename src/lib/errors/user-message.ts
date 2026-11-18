import { COPY, looksLikeCode, mapAuthCode, mapKnownMessage, phraseKey, readErrorParts } from "./copy.ts";
import { FRIENDLY_ERRORS } from "./public-error.ts";

/**
 * Network failures from the browser fetch layer. Wording differs per engine:
 * Chrome "Failed to fetch", Firefox "NetworkError when attempting to fetch
 * resource.", Safari "Load failed", Node/undici "fetch failed".
 */
const NETWORK = /^(failed to fetch|load failed|fetch failed|networkerror\b.*|network request failed|the network connection was lost\.?)$/i;

/**
 * Text that reads like a stack, a file path, a driver or SDK message, or a
 * runtime type error. None of these should ever reach a toast.
 */
const TECHNICAL = [
  /cannot find (package|module)/i,
  /\b(imported|required) from\b/i,
  /node_modules|\.output\/|\/app\/|\/src\/|\.(m?js|cjs|ts|tsx)\b/i,
  /\bat [\w$.<>]+ \(|\n\s+at /,
  /\b(ECONN\w*|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENOENT|EACCES|EPIPE|ERR_[A-Z_]+)\b/,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b/,
  /\b(undefined|null) is not\b|cannot read propert|is not a function|is not defined/i,
  /unexpected token|json\.parse|is not valid json/i,
  /\bSELECT\b.*\bFROM\b|\bINSERT INTO\b|\bUPDATE \w+ SET\b|\bDELETE FROM\b|\bsql\b/,
  /relation "|column "|violates .* constraint|duplicate key|syntax error/i,
  /\b(AccessDenied|NoSuchBucket|NoSuchKey|SignatureDoesNotMatch|InvalidAccessKeyId)\b/,
  /\bstatus code \d{3}\b|\bHTTP \d{3}\b/i,
  /^\s*[[{]/,
  /^(internal server error|forbidden.*|aborted|unknown error|error)$/i,
  /invalid storage key/i,
  /unknown [A-Z_]+ "|STORAGE_PROVIDER|DATABASE_URL|[A-Z]_KEY\b|[A-Z]_SECRET\b/,
];

export function looksTechnical(message: string): boolean {
  return TECHNICAL.some((pattern) => pattern.test(message));
}

function soften(message: string): string {
  return mapKnownMessage(message) ?? message;
}

/**
 * The sentence to show for a caught error. Keeps short, human messages
 * (validation, "That handle is already taken.") and swaps anything internal,
 * plus raw auth or provider text, for a shopper sentence.
 */
export function userMessage(error: unknown, fallback: string = FRIENDLY_ERRORS.generic): string {
  const parts = readErrorParts(error);
  const safeFallback = soften(fallback);
  if (parts.status === 429) return COPY.rateLimit;
  const fromCode = mapAuthCode(parts.code);
  if (fromCode && fromCode !== COPY.generic) return fromCode;
  const message = parts.message;
  if (!message) return fromCode ?? safeFallback;
  if (message === "Unauthorized") return FRIENDLY_ERRORS.signIn;
  if (NETWORK.test(message)) return FRIENDLY_ERRORS.offline;
  if (message.length > 200 || looksTechnical(message)) return safeFallback;
  const known = mapKnownMessage(message);
  if (known) return known;
  if (looksLikeCode(message) || !/\s/.test(message)) return FRIENDLY_ERRORS.generic;
  if (fromCode === COPY.generic && (looksLikeCode(parts.code) || phraseKey(message) === phraseKey(parts.code))) {
    return FRIENDLY_ERRORS.generic;
  }
  if (looksLikeCode(parts.code) && phraseKey(message) === phraseKey(parts.code)) return FRIENDLY_ERRORS.generic;
  return message;
}

/** Sign-in and sign-out paths. Same map as userMessage, including status and code. */
export function authErrorMessage(error: unknown, fallback: string = FRIENDLY_ERRORS.generic): string {
  return userMessage(error, fallback);
}

/** Find and shop-search results. Never returns vendor or operator text. */
export function presentFindError(error: unknown): string {
  return userMessage(error, COPY.findUnavailable);
}
