import type { ProductSearchRequest, VisionResult } from "./types";

export const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
export const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";

const VISION_MODEL = "grok-4.5";

/** Chat completion used to describe a look photo. No other file may call this host. */
export async function describeImage(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<VisionResult> {
  try {
    const response = await fetch(XAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: VISION_MODEL, ...body }),
    });
    if (!response.ok) {
      return { ok: false, error: `xAI API error ${response.status}` };
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const citations = Array.isArray(json.citations)
      ? json.citations.filter((item) => typeof item === "string")
      : [];
    return { ok: true, text, citations };
  } catch {
    return { ok: false, error: "Could not reach Grok." };
  }
}

/** Live product search. Returns null when the vendor refuses the request. */
export async function searchProducts(input: ProductSearchRequest): Promise<Response | null> {
  const response = await fetch(XAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      max_tool_calls: 1,
      include: ["web_search_call.action.sources"],
      input: input.prompt,
      tools: [
        {
          type: "web_search",
          filters: { allowed_domains: input.domains },
        },
      ],
    }),
    signal: input.signal,
  });
  if (!response.ok) return null;
  return response;
}
