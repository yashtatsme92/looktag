export const ADMIN_USER_ID = "admin";
export const ADMIN_EMAIL = "admin@looktag.studio";
export const ADMIN_PASSWORD = "admin";
export const ADMIN_NAME = "Admin";

export function normalizeLoginEmail(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value === "admin") return ADMIN_EMAIL;
  return raw.trim();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const value = (email ?? "").trim().toLowerCase();
  return value === ADMIN_EMAIL || value === "admin";
}
