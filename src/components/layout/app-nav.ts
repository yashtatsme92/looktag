/** Consumer chrome — Phase 1 slice A: Looks · Create · You only. */
export const APP_NAV = [
  { id: "looks", label: "Looks", to: "/" },
  { id: "create", label: "Create", to: "/create" },
] as const;

export type AppNavId = (typeof APP_NAV)[number]["id"];

export function isLooksPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/looks/");
}

/** Still used by Houses routes (Phase 2); not in shopper chrome. */
export function isHousesPath(pathname: string) {
  return pathname.startsWith("/houses");
}

export function isYouPath(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/creators/") ||
    pathname.startsWith("/admin")
  );
}

export function navItemActive(id: AppNavId, pathname: string) {
  if (id === "looks") return isLooksPath(pathname);
  const item = APP_NAV.find((row) => row.id === id);
  if (!item) return false;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
