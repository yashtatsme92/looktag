const MODEL = "grok-4.5";
const MAX_ITEMS = 3;

type VisionItem = {
  name: string;
  brand: string;
  x: number;
  y: number;
  searchQuery: string;
};

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(92, Math.max(8, Math.round(value)));
}

export async function readLookPhoto(
  apiKey: string,
  imageDataUrl: string,
): Promise<{ ok: true; items: VisionItem[] } | { ok: false; error: string }> {
  const prompt = `You are tagging a fashion look photo so a shopper can buy each worn piece.
Return JSON only: {"items":[{"name":"","brand":"","x":0,"y":0,"searchQuery":""}]}
Rules:
- Identify 2 to ${MAX_ITEMS} garments or accessories actually worn in the photo (coat, knit, bag, shoes, trousers, jewellery). Skip background furniture.
- name: short product name in English. brand: best guess or "".
- x,y: percent position of that piece on the image, 8–92. Coat ≈ torso, knit ≈ chest, bag ≈ hand/shoulder, shoes ≈ lower legs.
- searchQuery: a Google-style query to buy that piece in Germany, including brand if known, colour, and garment type. No quotes.`;

  const result = await grokChat(apiKey, {
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  if (!result.ok) return result;
  const parsed = extractJson(result.text) as { items?: unknown } | null;
  const items = Array.isArray(parsed?.items)
    ? parsed.items
        .map((row) => asVisionItem(row))
        .filter((row): row is VisionItem => Boolean(row))
    : [];
  if (items.length === 0) {
    return { ok: false, error: "The photo did not yield any wearable pieces. Try a clearer full-body shot." };
  }
  return { ok: true, items };
}

export async function identifyPin(
  apiKey: string,
  imageDataUrl: string,
  x: number,
  y: number,
  hint: string,
): Promise<{ ok: true; item: VisionItem } | { ok: false; error: string }> {
  const hintLine = hint
    ? `The wearer labelled it "${hint}". Use that if it matches what you see at the pin.`
    : "No label was given — identify only from the photo.";
  const prompt = `A pin was placed on a fashion look photo at x=${Math.round(x)}%, y=${Math.round(y)}% (origin top-left of the image).
Identify ONLY the garment or accessory under that pin. Ignore everything else.
${hintLine}
Return JSON only: {"name":"","brand":"","x":${Math.round(x)},"y":${Math.round(y)},"searchQuery":""}
Rules:
- name: short English product name. brand: best guess or "".
- searchQuery: a buy-query for Germany (brand, colour, garment). No quotes.
- Do not invent other pieces.`;

  const result = await grokChat(apiKey, {
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  if (!result.ok) return result;
  const parsed = extractJson(result.text);
  const item = asVisionItem(parsed);
  if (!item) {
    return { ok: false, error: "Could not tell what is under that pin. Try a name, then search again." };
  }
  return { ok: true, item };
}

export function asVisionItem(row: unknown): VisionItem | null {
  if (!row || typeof row !== "object") return null;
  const item = row as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name) return null;
  return {
    name: name.slice(0, 80),
    brand: typeof item.brand === "string" ? item.brand.trim().slice(0, 40) : "",
    x: typeof item.x === "number" ? item.x : Number(item.x) || 50,
    y: typeof item.y === "number" ? item.y : Number(item.y) || 50,
    searchQuery:
      typeof item.searchQuery === "string" && item.searchQuery.trim()
        ? item.searchQuery.trim().slice(0, 140)
        : name,
  };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

export async function grokChat(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; text: string; citations: string[] } | { ok: false; error: string }> {
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, ...body }),
    });
    if (!response.ok) {
      return { ok: false, error: `xAI API error ${response.status}` };
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const citations = Array.isArray(json.citations) ? json.citations.filter((item) => typeof item === "string") : [];
    return { ok: true, text, citations };
  } catch {
    return { ok: false, error: "Could not reach Grok." };
  }
}
