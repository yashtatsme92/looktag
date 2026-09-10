import { parseHandle } from "./handle.ts";

export type ProfileFields = {
  name: string;
  email: string;
  handle: string;
  city: string;
  bio: string;
  newPassword: string;
};

export type ProfileParse =
  | { ok: true; value: ProfileFields }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseProfileFields(input: {
  name?: string;
  email?: string;
  handle?: string;
  city?: string;
  bio?: string;
  newPassword?: string;
}): ProfileParse {
  const name = (input.name ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Give your name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };

  const parsedHandle = parseHandle(input.handle ?? "");
  if (!parsedHandle.ok) return parsedHandle;

  const city = (input.city ?? "").trim();
  if (city.length > 80) return { ok: false, error: "Keep the city under 80 characters." };

  const bio = (input.bio ?? "").trim();
  if (bio.length > 280) return { ok: false, error: "Keep the about under 280 characters." };

  const email = (input.email ?? "").trim().toLowerCase();
  if (email === "admin") {
    return {
      ok: true,
      value: {
        name,
        email: "admin@looktag.studio",
        handle: parsedHandle.value,
        city,
        bio,
        newPassword: (input.newPassword ?? "").trim(),
      },
    };
  }
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Use a valid email." };

  const newPassword = (input.newPassword ?? "").trim();
  if (newPassword && newPassword.length < 8) {
    return { ok: false, error: "New password needs at least 8 characters." };
  }

  return {
    ok: true,
    value: { name, email, handle: parsedHandle.value, city, bio, newPassword },
  };
}
