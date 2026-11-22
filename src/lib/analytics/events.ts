export const ANALYTICS_EVENTS = [
  "auth_gate_shown",
  "auth_method_chosen",
  "signup_completed",
  "login_completed",
  "auth_action_resumed",
  "look_saved",
  "look_unsaved",
  "creator_followed",
  "creator_unfollowed",
  "house_followed",
  "look_viewed",
  "pin_tapped",
  "shop_sheet_opened",
  "shop_outbound_click",
  "create_started",
  "pin_added",
  "find_pieces_used",
  "title_missing_blocked",
  "draft_saved",
  "look_published",
  "echo_used",
  "look_shared",
  "house_viewed",
  "style_card_tapped",
  "feed_view_switched",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const EVENT_SET = new Set<string>(ANALYTICS_EVENTS);

export function isAnalyticsEvent(value: string): value is AnalyticsEvent {
  return EVENT_SET.has(value);
}

export type AuthGateSource = "save" | "publish" | "save_draft" | "follow" | "you" | "find_pieces" | "admin";

/** Map an existing account sheet to an allowlisted gate source. */
export function authGateSource(input: { intent?: string; title?: string }): AuthGateSource | null {
  if (input.intent === "publish") return "publish";
  if (input.intent === "draft") return "save_draft";
  if (input.intent === "follow") return "follow";
  if (input.intent === "save") return "save";
  const title = (input.title ?? "").toLowerCase();
  if (title.includes("find pieces")) return "find_pieces";
  if (title.includes("admin")) return "admin";
  if (title.includes("sync you")) return "you";
  if (title.includes("follow")) return "follow";
  if (title.includes("publish")) return "publish";
  if (title.includes("save")) return "save";
  return null;
}

export function resumeSource(intent: "find" | "publish" | "draft" | "save"): AuthGateSource {
  if (intent === "find") return "find_pieces";
  if (intent === "publish") return "publish";
  if (intent === "draft") return "save_draft";
  return "save";
}

/** shareOrCopy results, mapped to a closed channel list. Never the URL. */
export function shareChannel(result: "shared" | "copied" | "shown"): "native" | "copy" | "sheet" {
  if (result === "shared") return "native";
  if (result === "copied") return "copy";
  return "sheet";
}

/** Where a look page was opened from. Same-origin non-house paths count as feed. */
export function lookViewFrom(referrer: string, origin: string): "feed" | "house" | "share" | "deeplink" {
  if (!referrer) return "deeplink";
  try {
    const url = new URL(referrer);
    if (url.origin !== origin) return "share";
    if (url.pathname === "/houses" || url.pathname.startsWith("/houses/")) return "house";
    return "feed";
  } catch {
    return "deeplink";
  }
}
