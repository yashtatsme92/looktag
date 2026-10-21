export type AiProviderName = "xai" | "stub";

export type VisionResult =
  | { ok: true; text: string; citations: string[] }
  | { ok: false; error: string };

export type ProductSearchRequest = {
  apiKey: string;
  model: string;
  prompt: string;
  domains: string[];
  signal?: AbortSignal;
};

export interface AiProvider {
  describeImage(apiKey: string, body: Record<string, unknown>): Promise<VisionResult>;
  searchProducts(input: ProductSearchRequest): Promise<Response | null>;
}
