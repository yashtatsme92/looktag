export const APP_NAV = [
  { id: "looks", label: "Looks", to: "/" },
  { id: "create", label: "Create", to: "/create" },
  { id: "houses", label: "Houses", to: "/houses" },
  { id: "rank", label: "Rank", to: "/rank" },
] as const;

export type AppNavId = (typeof APP_NAV)[number]["id"];

export function isLooksPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/looks/");
}

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
  if (id === "houses") return isHousesPath(pathname);
  const item = APP_NAV.find((row) => row.id === id);
  if (!item) return false;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
