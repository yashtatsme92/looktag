/** Unset stays the caller's default. A value outside the list fails with the variable name. */
export function unknownProvider(variable: string, value: string, allowed: readonly string[]): never {
  throw new Error(`Unknown ${variable} "${value}". Expected ${allowed.join("|")}.`);
}
