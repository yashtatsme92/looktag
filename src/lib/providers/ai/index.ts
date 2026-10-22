import { describeImage as stubDescribe, searchProducts as stubSearch } from "./stub.ts";
import type { AiProviderName, ProductSearchRequest, VisionResult } from "./types.ts";
import { describeImage as xaiDescribe, readXaiApiKey, searchProducts as xaiSearch } from "./xai.ts";
import { unknownProvider } from "../unknown.ts";

export type { AiProvider, AiProviderName, ProductSearchRequest, VisionResult } from "./types.ts";
export { readXaiApiKey } from "./xai.ts";

type Env = { AI_PROVIDER?: string; XAI_API_KEY?: string };

const AI_PROVIDERS = ["xai", "stub"] as const;

/** Read once per call from the env snapshot. `xai` only when a key is present, unless forced. */
export function resolveAiProvider(env: Env = process.env): AiProviderName {
  const named = env.AI_PROVIDER?.trim().toLowerCase();
  if (named && named !== "xai" && named !== "stub") unknownProvider("AI_PROVIDER", named, AI_PROVIDERS);
  if (named === "stub") return "stub";
  if (named === "xai") return "xai";
  return readXaiApiKey(env) ? "xai" : "stub";
}

/** Same gate the product used before the adapter split: no key means not available. */
export function aiAvailable(env: Env = process.env): boolean {
  return resolveAiProvider(env) === "xai" && Boolean(readXaiApiKey(env));
}

function xaiSelected(apiKey: string): boolean {
  return resolveAiProvider() === "xai" && Boolean(apiKey);
}

export async function describeImage(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<VisionResult> {
  if (!xaiSelected(apiKey)) return stubDescribe();
  return xaiDescribe(apiKey, body);
}

export async function searchProducts(input: ProductSearchRequest): Promise<Response | null> {
  if (!xaiSelected(input.apiKey)) return stubSearch();
  return xaiSearch(input);
}
