import * as consoleReporter from "./console.ts";
import type { ErrorContext, ErrorProviderName, ErrorUser } from "./types.ts";
import { unknownProvider } from "../unknown.ts";

export type { ErrorContext, ErrorProviderName, ErrorReporter, ErrorUser } from "./types.ts";

type Env = { ERROR_PROVIDER?: string };

const ERROR_PROVIDERS = ["console", "sentry", "none"] as const;

/** `ERROR_PROVIDER=console|sentry|none`. Default console. */
export function resolveErrorProvider(env: Env = process.env): ErrorProviderName {
  const named = env.ERROR_PROVIDER?.trim().toLowerCase();
  if (!named) return "console";
  if (named === "console" || named === "sentry" || named === "none") return named;
  unknownProvider("ERROR_PROVIDER", named, ERROR_PROVIDERS);
}

function fallback(method: "captureException" | "captureMessage", value: unknown, context?: ErrorContext) {
  if (method === "captureException") consoleReporter.captureException(value, context);
  else consoleReporter.captureMessage(String(value), context);
}

function report(method: "captureException" | "captureMessage", value: unknown, context?: ErrorContext) {
  let provider: ErrorProviderName = "console";
  try {
    provider = resolveErrorProvider();
  } catch (error) {
    console.error("[errors] reporter configuration failed; using console", error);
    provider = "console";
  }
  if (provider === "none") return;
  if (provider === "sentry") {
    void import("./sentry.ts")
      .then((mod) => {
        const pending =
          method === "captureException" ? mod.captureException(value, context) : mod.captureMessage(String(value), context);
        return Promise.resolve(pending).catch((error: unknown) => {
          console.error("[errors] sentry adapter failed; using console", error);
          fallback(method, value, context);
        });
      })
      .catch((error: unknown) => {
        console.error("[errors] sentry adapter failed; using console", error);
        fallback(method, value, context);
      });
    return;
  }
  fallback(method, value, context);
}

/** Never throws. A bad provider or a failed adapter logs and falls back to the console reporter. */
export function captureException(error: unknown, context?: ErrorContext): void {
  try {
    report("captureException", error, context);
  } catch (failure) {
    try {
      console.error("[errors] captureException failed", failure);
      console.error(error);
    } catch {
      /* the original error must not be replaced by a reporter failure */
    }
  }
}

/** Never throws. See `captureException`. */
export function captureMessage(message: string, context?: ErrorContext): void {
  try {
    report("captureMessage", message, context);
  } catch (failure) {
    try {
      console.error("[errors] captureMessage failed", failure);
      console.error(message);
    } catch {
      /* keep the caller's error */
    }
  }
}

export function setUser(user: ErrorUser): void {
  let provider: ErrorProviderName = "console";
  try {
    provider = resolveErrorProvider();
  } catch (error) {
    console.error("[errors] reporter configuration failed; using console", error);
    return;
  }
  if (provider !== "sentry") {
    try {
      consoleReporter.setUser(user);
    } catch (error) {
      console.error("[errors] setUser failed", error);
    }
    return;
  }
  void import("./sentry.ts")
    .then((mod) => mod.setUser(user))
    .catch((error: unknown) => {
      console.error("[errors] sentry adapter failed", error);
    });
}
