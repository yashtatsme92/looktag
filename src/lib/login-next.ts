/** In-app path after sign-in. Rejects protocol-relative and auth loops. */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return undefined;
  return value;
}

export function postAuthPath(next: string | undefined, fallback = "/"): string {
  return safeNext(next) ?? fallback;
}

/** True when the login screen is still waiting on the session instead of showing the form. */
export function loginScreenStuck(opts: {
  path: string;
  isPending: boolean;
  hasForm: boolean;
  elapsedMs: number;
  limitMs?: number;
}): boolean {
  if (opts.path !== "/login") return false;
  const limit = opts.limitMs ?? 4000;
  return opts.isPending && !opts.hasForm && opts.elapsedMs >= limit;
}

/** Same key the auth client reads in the live-preview iframe. */
export const PREVIEW_BEARER_KEY = "grok-auth.bearer-token";

/** Persist the email/password session token so preview (partitioned cookies) can read it. */
export function captureSessionToken(token: unknown): boolean {
  if (typeof token !== "string" || !token.trim()) return false;
  if (typeof globalThis.sessionStorage === "undefined") return false;
  try {
    globalThis.sessionStorage.setItem(PREVIEW_BEARER_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
