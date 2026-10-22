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

function report(method: "captureException" | "captureMessage", value: unknown, context?: ErrorContext) {
  const provider = resolveErrorProvider();
  if (provider === "none") return;
  if (provider === "sentry") {
    void import("./sentry.ts").then((mod) => {
      if (method === "captureException") void mod.captureException(value, context);
      else void mod.captureMessage(String(value), context);
    });
    return;
  }
  if (method === "captureException") consoleReporter.captureException(value, context);
  else consoleReporter.captureMessage(String(value), context);
}

export function captureException(error: unknown, context?: ErrorContext): void {
  report("captureException", error, context);
}

export function captureMessage(message: string, context?: ErrorContext): void {
  report("captureMessage", message, context);
}

export function setUser(user: ErrorUser): void {
  const provider = resolveErrorProvider();
  if (provider !== "sentry") {
    consoleReporter.setUser(user);
    return;
  }
  void import("./sentry.ts").then((mod) => mod.setUser(user));
}
