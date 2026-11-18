import { COPY } from "../../errors/copy.ts";
import type { ProductSearchRequest, VisionResult } from "./types";

/** Deterministic stand-in. No network. */
export async function describeImage(
  _apiKey?: string,
  _body?: Record<string, unknown>,
): Promise<VisionResult> {
  return { ok: false, error: COPY.findUnavailable };
}

export async function searchProducts(_input?: ProductSearchRequest): Promise<null> {
  return null;
}
