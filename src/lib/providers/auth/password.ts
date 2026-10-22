import { hashPassword as hash, verifyPassword as verify } from "better-auth/crypto";

/** Password hashing stays on Better Auth's crypto. App code calls this, not the package. */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  return verify(input);
}
