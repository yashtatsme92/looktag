import type { Look } from "./types";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;

const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "create",
  "creator",
  "editorial",
  "help",
  "houses",
  "login",
  "looktag",
  "me",
  "profile",
  "rank",
  "settings",
  "studio",
  "support",
  "you",
]);

export type HandleParse = { ok: true; value: string } | { ok: false; error: string };

export function slugHandle(name: string, max = 24): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}

export function suggestHandle(name: string): string {
  return slugHandle(name, 24);
}

export function parseHandle(raw: string): HandleParse {
  const handle = raw.trim().replace(/^@/, "").toLowerCase();
  if (handle.length < 2) return { ok: false, error: "Handle needs at least 2 characters." };
  if (handle.length > 24) return { ok: false, error: "Keep the handle under 24 characters." };
  if (!HANDLE_RE.test(handle)) return { ok: false, error: "Use letters, numbers, and hyphens." };
  if (RESERVED_HANDLES.has(handle)) return { ok: false, error: "That handle is reserved." };
  return { ok: true, value: handle };
}

export function makeHandle(name: string, userId: string): string {
  const base = slugHandle(name, 20);
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "user";
  return `${base || "creator"}-${suffix}`.slice(0, 32);
}

export function emptySelfProfile(input: {
  userId: string;
  displayName: string;
  handle?: string;
  city?: string;
  bio?: string;
}): {
  creator: {
    userId: string;
    displayName: string;
    handle: string;
    city: string;
    bio: string;
    looks: number;
    pins: number;
    compared: number;
    score: number;
  };
  looks: Look[];
} {
  const displayName = input.displayName.trim() || "Creator";
  return {
    creator: {
      userId: input.userId,
      displayName,
      handle: input.handle?.trim() || makeHandle(displayName, input.userId),
      city: input.city?.trim() || "",
      bio: input.bio?.trim() || "",
      looks: 0,
      pins: 0,
      compared: 0,
      score: 0,
    },
    looks: [],
  };
}
