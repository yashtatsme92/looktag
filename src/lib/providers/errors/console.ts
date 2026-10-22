import type { ErrorContext, ErrorUser } from "./types";

/** Default reporter. Prints to stderr and keeps the previous log shape when `where` is set. */
export function captureException(error: unknown, context?: ErrorContext): void {
  if (typeof context?.where === "string") console.error(context.where, error);
  else console.error(error);
}

export function captureMessage(message: string, context?: ErrorContext): void {
  if (context && Object.keys(context).length > 0) console.error(message, context);
  else console.error(message);
}

export function setUser(_user: ErrorUser): void {
  // The console adapter has no user scope.
}
