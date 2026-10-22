import type { ProductSearchRequest, VisionResult } from "./types";

const UNAVAILABLE = "AI is not available in this environment.";

/** Deterministic stand-in. No network. */
export async function describeImage(
  _apiKey?: string,
  _body?: Record<string, unknown>,
): Promise<VisionResult> {
  return { ok: false, error: UNAVAILABLE };
}

export async function searchProducts(_input?: ProductSearchRequest): Promise<null> {
  return null;
}
