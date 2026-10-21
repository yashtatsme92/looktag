export type ErrorProviderName = "console" | "sentry" | "none";

export type ErrorUser = { id?: string; email?: string } | null;

export type ErrorContext = Record<string, unknown>;

export interface ErrorReporter {
  captureException(error: unknown, context?: ErrorContext): void;
  captureMessage(message: string, context?: ErrorContext): void;
  setUser(user: ErrorUser): void;
}
