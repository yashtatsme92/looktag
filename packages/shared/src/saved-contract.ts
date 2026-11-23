export const SAVED_LOOKS_KEY = "looktag-saved-v1";

export function parseSavedLookIds(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function mergeSavedLookIds(current: readonly string[], stored: readonly string[]): string[] {
  return [...new Set([...current, ...stored])];
}

export function toggleSavedLookId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [id, ...ids];
}
