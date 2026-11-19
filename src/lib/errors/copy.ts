/**
 * Shopper and creator sentences.
 *
 * Style guide:
 * - Brand spelling is Looktag, not LookTag.
 * - Short sentences. Plain language.
 * - Say what happened and what to do next.
 * - Use "We couldn't ..." or a direct, calm fact. End full sentences with a period.
 * - Use "Please try again." or a more specific next step.
 * - No em dash or en dash. Use a comma, a period, or the word or.
 * - No vendor names, no Catalog, no Studio, no CSRF, no origin, no callbackURL,
 *   no environment, and no status codes in these sentences.
 * - Do not confirm whether an email or a password was the one that was wrong.
 * - Field errors sit next to the field. Toasts cover actions that have no field.
 */

export const COPY = {
  generic: "Something went wrong on our side. Please try again in a moment.",
  photoUpload: "We couldn't upload your photo right now. Please try again in a moment.",
  offline: "We couldn't reach Looktag. Check your connection and try again.",
  invalidInput: "Some of that didn't look right. Check it and try again.",
  forbidden: "You don't have access to do that.",
  signIn: "Sign in to continue.",

  findUnavailable: "We can't find pieces in the photo right now. You can still pin them yourself.",
  findQuota: "You've reached today's find limit. Try again later, or pin the pieces yourself.",
  findEmpty: "No pieces found. Tap the photo to pin them yourself.",
  searchUnavailable: "We can't search shops right now. Try again in a moment, or paste the product page.",
  shopsNotReady: "Shop search isn't ready yet. Paste the product page, or try again later.",
  photoNoPieces:
    "We couldn't spot wearable pieces in that photo. Try a clearer full-body shot, or pin them yourself.",
  noItemPages: "No item pages in those shops. Try a more specific name, or paste the page you wore.",
  photoTooLargeSearch: "That photo is too large to search. Try a smaller one, or pin the piece yourself.",
  namePiece: "Name the piece (colour and garment), then search.",
  httpsLink: "Paste the full product page link, including https.",
  productNotHome: "Paste the product page, not the shop homepage. For example, a Zalando item link.",
  searchFailed: "We couldn't finish the search. Please try again.",
  pinUnknown: "Could not tell what is under that pin. Try a name, then search again.",

  authWrong: "That email or password isn't right. Try again.",
  authExists: "That email already has an account. Sign in, or use a different email.",
  passwordShort: "Use a password of at least 8 characters.",
  passwordLong: "Keep the password shorter and try again.",
  signInPage: "We couldn't complete sign-in from this page. Refresh and try again.",
  sessionEnded: "Your session ended. Sign in again to continue.",
  emailVerify: "Confirm your email, then try again.",
  accountMissing: "We couldn't find that account. Check the email, or create an account.",
  socialLinked:
    "That sign-in method is already used on another account. Try another method, or sign in with email.",
  popupBlocked: "Allow pop-ups for this site, then try sign-in again.",
  signInCancelled: "Sign-in didn't finish. If you closed the window, try again.",
  signInFailed: "Sign-in didn't complete. Please try again.",
  signOutFailed: "We couldn't sign you out. Please try again.",
  accountCreateFailed: "Couldn't create the account. Please try again.",
  couldNotSignIn: "Couldn't sign in. Please try again.",
  signupOff: "Sign-up is turned off right now. Try again later, or use an enabled sign-in method.",
  chooseMethod: "Choose a sign-in method below.",
  rateLimit: "You've tried too many times. Wait a moment, then try again.",

  photoLinkLong: "That photo link is too long. Try uploading the photo instead.",
  photoTooLargeFormat: "That photo is too large. Try a smaller JPEG, PNG, or WebP.",
  validEmail: "Enter a valid email, like you@email.com.",
  loadAccount: "We couldn't load your account. Try again.",
  emailReserved: "That email can't be used. Try a different one.",
  noPassword: "This account signs in with Google or Apple, so there's no password to change here.",
  currentPassword: "That current password isn't right. Try again.",
  splash: "That splash design isn't valid. Pick another and try again.",

  loadThis: "We couldn't load this. Try again.",
  loadConnection: "We couldn't load this. Check your connection and try again.",
  loadSaved: "We couldn't load your saved looks. Try again.",
  loadProfile: "We couldn't load your profile. Try again.",
  signupProfile:
    "We created your account, but couldn't save your profile details. You can add them under You.",
  photoPlaceholder: "Photo couldn't load. Try refreshing the page.",
  notFoundTitle: "This page isn't here.",
  notFoundBody: "The link may be old, or this page isn't available.",
  backToLooks: "Back to looks",
  reload: "Reload",
  lookDeleted: "It may have been deleted.",
  styleMissing: "This style is not on Looktag yet.",
  tryAgain: "Try again",
} as const;

export type CopyKey = keyof typeof COPY;

/** One shape for save, remove, reorder, and similar action failures. */
export function couldNot(action: string): string {
  const trimmed = action.trim().replace(/[.]+$/g, "");
  return `We couldn't ${trimmed}. Please try again.`;
}

export function offlineNow(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const CODE_MAP: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: COPY.authWrong,
  INVALID_EMAIL: COPY.authWrong,
  INVALID_PASSWORD: COPY.authWrong,
  USER_ALREADY_EXISTS: COPY.authExists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: COPY.authExists,
  PASSWORD_TOO_SHORT: COPY.passwordShort,
  PASSWORD_TOO_LONG: COPY.passwordLong,
  INVALID_ORIGIN: COPY.signInPage,
  INVALID_CALLBACK_URL: COPY.signInPage,
  INVALID_CALLBACKURL: COPY.signInPage,
  INVALID_REDIRECT_URL: COPY.signInPage,
  INVALID_ERROR_CALLBACK_URL: COPY.signInPage,
  INVALID_NEW_USER_CALLBACK_URL: COPY.signInPage,
  MISSING_OR_NULL_ORIGIN: COPY.signInPage,
  CALLBACK_URL_REQUIRED: COPY.signInPage,
  SESSION_EXPIRED: COPY.sessionEnded,
  TOKEN_EXPIRED: COPY.sessionEnded,
  INVALID_TOKEN: COPY.sessionEnded,
  SESSION_NOT_FRESH: COPY.sessionEnded,
  EMAIL_NOT_VERIFIED: COPY.emailVerify,
  USER_NOT_FOUND: COPY.accountMissing,
  ACCOUNT_NOT_FOUND: COPY.accountMissing,
  CREDENTIAL_ACCOUNT_NOT_FOUND: COPY.accountMissing,
  PROVIDER_NOT_FOUND: COPY.accountMissing,
  INVALID_USER: COPY.accountMissing,
  USER_EMAIL_NOT_FOUND: COPY.accountMissing,
  SOCIAL_ACCOUNT_ALREADY_LINKED: COPY.socialLinked,
  LINKED_ACCOUNT_ALREADY_EXISTS: COPY.socialLinked,
  TOO_MANY_REQUESTS: COPY.rateLimit,
  RATE_LIMIT: COPY.rateLimit,
  FAILED_TO_CREATE_USER: COPY.generic,
  FAILED_TO_CREATE_SESSION: COPY.generic,
  FAILED_TO_GET_SESSION: COPY.generic,
  FAILED_TO_UPDATE_USER: COPY.generic,
  FAILED_TO_GET_USER_INFO: COPY.generic,
  FAILED_TO_CREATE_VERIFICATION: COPY.generic,
};

const PHRASE_MAP: Record<string, string> = {
  "invalid email or password": COPY.authWrong,
  "invalid password": COPY.authWrong,
  "invalid email": COPY.authWrong,
  "user already exists": COPY.authExists,
  "user already exists use another email": COPY.authExists,
  "password too short": COPY.passwordShort,
  "password too long": COPY.passwordLong,
  "invalid origin": COPY.signInPage,
  "invalid callbackurl": COPY.signInPage,
  "invalid redirecturl": COPY.signInPage,
  "invalid errorcallbackurl": COPY.signInPage,
  "invalid newusercallbackurl": COPY.signInPage,
  "missing or null origin": COPY.signInPage,
  "callbackurl is required": COPY.signInPage,
  "session expired re authenticate to perform this action": COPY.sessionEnded,
  "session expired": COPY.sessionEnded,
  "token expired": COPY.sessionEnded,
  "invalid token": COPY.sessionEnded,
  "session is not fresh": COPY.sessionEnded,
  "email not verified": COPY.emailVerify,
  "user not found": COPY.accountMissing,
  "account not found": COPY.accountMissing,
  "credential account not found": COPY.accountMissing,
  "provider not found": COPY.accountMissing,
  "invalid user": COPY.accountMissing,
  "user email not found": COPY.accountMissing,
  "social account already linked": COPY.socialLinked,
  "linked account already exists": COPY.socialLinked,
  "pop up blocked allow pop ups for sign in": COPY.popupBlocked,
  "sign in was cancelled or failed": COPY.signInCancelled,
  "sign in failed": COPY.signInFailed,
  "sign out failed": COPY.signOutFailed,
  "sign in did not complete": COPY.signInFailed,
  "could not create the account": COPY.accountCreateFailed,
  "could not sign in": COPY.couldNotSignIn,
  "something went wrong": COPY.generic,
  "an unexpected error occurred try reloading the page": COPY.generic,
  "search did not complete": COPY.searchFailed,
  "ai find isnt available right now": COPY.findUnavailable,
  "ai is not available in this environment": COPY.findUnavailable,
  "could not reach grok": COPY.findUnavailable,
  "too many ai searches try again later": COPY.findQuota,
  "ai find limit reached try again later": COPY.findQuota,
  "no pieces found tap to pin": COPY.findEmpty,
  "add a brave search api key in catalog": COPY.searchUnavailable,
  "add a google api key and search engine id in catalog": COPY.searchUnavailable,
  "turn on at least one shop in catalog before searching": COPY.shopsNotReady,
  "the photo did not yield any wearable pieces try a clearer full body shot": COPY.photoNoPieces,
  "no item pages found in the shops that are turned on": COPY.noItemPages,
  "that photo is too large to send": COPY.photoTooLargeSearch,
  "name the piece first": COPY.namePiece,
  "name the piece colour and garment then search": COPY.namePiece,
  "every product link needs to start with https": COPY.httpsLink,
  "paste the product page not the shop homepage e g a zalando item link": COPY.productNotHome,
  "that photo link is too long": COPY.photoLinkLong,
  "use a valid email": COPY.validEmail,
  "could not load your account": COPY.loadAccount,
  "that email is reserved": COPY.emailReserved,
  "this account signs in without a password": COPY.noPassword,
  "current password is not right": COPY.currentPassword,
  "invalid splash design": COPY.splash,
  "that photo is too large": COPY.photoTooLargeFormat,
  "add a photo or a smaller one": COPY.photoTooLargeFormat,
  "could not tell what is under that pin": COPY.pinUnknown,
  "probe failed": couldNot("run that check"),
  "too many requests": COPY.rateLimit,
};

export function phraseKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[—–]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text is an error code, not a sentence a person wrote. */
export function looksLikeCode(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (/^[A-Z0-9_]+$/.test(trimmed) && trimmed.includes("_")) return true;
  if (!/\s/.test(trimmed) && /[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) return true;
  if (!/\s/.test(trimmed) && /^[a-z0-9_]+$/.test(trimmed) && trimmed.includes("_")) return true;
  return false;
}

function mapCouldNot(message: string): string | null {
  const match = message.trim().match(/^Could not ([^.]+)[.]?$/i);
  if (!match) return null;
  const action = match[1].trim();
  if (!action) return null;
  if (phraseKey(action) === "create the account") return COPY.accountCreateFailed;
  if (phraseKey(action) === "sign in") return COPY.couldNotSignIn;
  if (phraseKey(action) === "tell what is under that pin") return COPY.pinUnknown;
  return couldNot(action.charAt(0).toLowerCase() + action.slice(1));
}

/**
 * Rewrite a known raw string. Returns null when the sentence is already fine
 * to show, including validation such as "Give the look a name."
 */
export function mapKnownMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  const key = phraseKey(trimmed);
  if (PHRASE_MAP[key]) return PHRASE_MAP[key];
  if (key.startsWith("failed to ")) return COPY.generic;
  if (key.startsWith("xai api error") || /\bxai api error\b/.test(key)) return COPY.findUnavailable;
  if (/\bgrok\b|\bxai\b/.test(key)) return COPY.findUnavailable;
  if (key.includes("csrf") || key.includes("callbackurl")) return COPY.signInPage;
  if (key.includes("invalid origin") || key.includes("missing or null origin")) return COPY.signInPage;
  if (key.includes("cross site") && (key.includes("login") || key.includes("blocked") || key.includes("csrf"))) {
    return COPY.signInPage;
  }
  if (key.includes("api key") || (key.includes("catalog") && (key.includes("key") || key.includes("shop")))) {
    if (key.includes("turn on") && key.includes("shop")) return COPY.shopsNotReady;
    return COPY.searchUnavailable;
  }
  if (key.includes("not available") && key.includes("environment")) return COPY.findUnavailable;
  return mapCouldNot(trimmed);
}

export function mapAuthCode(code: string | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().replace(/[.\s-]+/g, "_").toUpperCase();
  if (CODE_MAP[normalized]) return CODE_MAP[normalized];
  if (normalized.startsWith("FAILED_TO_")) return COPY.generic;
  return null;
}

export type AuthParts = { message: string; code: string; status?: number };

export function readErrorParts(error: unknown): AuthParts {
  if (typeof error === "string") return { message: error.trim(), code: "" };
  if (error instanceof Error) {
    const extra = error as Error & { code?: unknown; status?: unknown };
    return {
      message: error.message.trim(),
      code: typeof extra.code === "string" ? extra.code : "",
      status: typeof extra.status === "number" ? extra.status : undefined,
    };
  }
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; code?: unknown; status?: unknown };
    return {
      message: typeof value.message === "string" ? value.message.trim() : "",
      code: typeof value.code === "string" ? value.code : "",
      status: typeof value.status === "number" ? value.status : undefined,
    };
  }
  return { message: "", code: "" };
}

export type FieldName = "name" | "handle" | "email" | "city" | "bio" | "password" | "form";

/** Which on-screen field a validation or sign-in sentence belongs beside. */
export function messageField(message: string): FieldName {
  const key = phraseKey(message);
  if (key.includes("handle")) return "handle";
  if (key.includes("email or password") || key.includes("password")) return "password";
  if (key.includes("email")) return "email";
  if (key.includes("city")) return "city";
  if (key.includes("about") || key.includes("bio")) return "bio";
  if (key === "give your name" || key.includes("keep the name")) return "name";
  return "form";
}

const DASH = /[\u2014\u2013]/;

export function copyHasDash(value: string): boolean {
  return DASH.test(value);
}
