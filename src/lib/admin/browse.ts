import { shopPriorityScore } from "../looks/retailers.ts";
import type { HouseStatus } from "../labels/model.ts";

export const ADMIN_PAGE_SIZE = 12;

export type HouseSort = "awesome" | "name" | "newest" | "status" | "score";
export type ShopSort = "awesome" | "name" | "on" | "pins";
export type HouseFilter = "all" | "pending" | "live" | "declined" | "scouted";
export type ShopFilter = "all" | "on" | "off";
export type PageMark = number | "gap";

export const HOUSE_SORTS: { id: HouseSort; label: string }[] = [
  { id: "awesome", label: "Awesome" },
  { id: "name", label: "Name" },
  { id: "newest", label: "Newest" },
  { id: "status", label: "Status" },
  { id: "score", label: "Score" },
];

export const SHOP_SORTS: { id: ShopSort; label: string }[] = [
  { id: "awesome", label: "Awesome" },
  { id: "name", label: "Name" },
  { id: "on", label: "On" },
  { id: "pins", label: "Pins" },
];

export const HOUSE_FILTERS: { id: HouseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Waiting" },
  { id: "live", label: "Live" },
  { id: "declined", label: "Declined" },
  { id: "scouted", label: "Scouted" },
];

export const STUDIO_HOUSE_SORTS: { id: HouseSort; label: string }[] = HOUSE_SORTS.filter(
  (item) => item.id !== "status",
);

export const STUDIO_HOUSE_FILTERS: { id: HouseFilter; label: string }[] = HOUSE_FILTERS.filter(
  (item) => item.id === "all" || item.id === "scouted",
);

export const SHOP_FILTERS: { id: ShopFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
];

export type HouseBrowseItem = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  city: string;
  moods: string[];
  scouted: boolean;
  status: HouseStatus;
  createdAt: number;
  looks: number;
  pins: number;
  score: number;
};

export type ShopBrowseItem = {
  id: string;
  name: string;
  domains: string[];
  enabled: boolean;
  custom: boolean;
  pins: number;
};

export type PageSlice<T> = {
  items: T[];
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
};

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function matchesQuery(query: string, parts: Array<string | undefined | null>): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  const hay = parts.map((part) => (part ?? "").toLowerCase()).join(" ");
  return q.split(/\s+/).every((token) => hay.includes(token));
}

export function queryMatchBoost(query: string, name: string, extra: string[] = []): number {
  const q = normalizeQuery(query);
  if (!q) return 0;
  const n = name.toLowerCase();
  if (n === q) return 50;
  if (n.startsWith(q)) return 28;
  if (n.includes(q)) return 14;
  if (extra.some((part) => (part ?? "").toLowerCase().includes(q))) return 6;
  return 0;
}

export function paginate<T>(items: T[], page: number, size = ADMIN_PAGE_SIZE): PageSlice<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const safe = Math.min(Math.max(1, page), pages);
  const start = (safe - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: safe,
    pages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

export function pageWindow(page: number, pages: number): PageMark[] {
  if (pages <= 1) return pages === 1 ? [1] : [];
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const nums = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: PageMark[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push("gap");
    out.push(nums[i]);
  }
  return out;
}

export function houseAwesomeness(house: HouseBrowseItem): number {
  const scouted = house.scouted ? 24 : 0;
  const pending = house.status === "pending" ? 10 : 0;
  const declined = house.status === "rejected" ? -30 : 0;
  return house.score + house.looks * 2 + house.pins + scouted + pending + declined;
}

export function houseMatches(house: HouseBrowseItem, query: string): boolean {
  return matchesQuery(query, [
    house.name,
    house.handle,
    house.city,
    house.bio,
    house.status,
    house.scouted ? "scouted" : "",
    ...house.moods,
  ]);
}

export function housePassesFilter(house: HouseBrowseItem, filter: HouseFilter): boolean {
  if (filter === "pending") return house.status === "pending";
  if (filter === "live") return house.status === "approved";
  if (filter === "declined") return house.status === "rejected";
  if (filter === "scouted") return house.scouted;
  return true;
}

const STATUS_ORDER: Record<HouseStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

export function sortHouses<T extends HouseBrowseItem>(houses: T[], sort: HouseSort): T[] {
  return [...houses].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name) || a.handle.localeCompare(b.handle);
    if (sort === "newest") return b.createdAt - a.createdAt || a.name.localeCompare(b.name);
    if (sort === "score") return b.score - a.score || a.name.localeCompare(b.name);
    if (sort === "status") {
      const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (status !== 0) return status;
      return b.createdAt - a.createdAt;
    }
    const awesome = houseAwesomeness(b) - houseAwesomeness(a);
    if (awesome !== 0) return awesome;
    return a.name.localeCompare(b.name);
  });
}

export function browseHouses<T extends HouseBrowseItem>(
  houses: T[],
  query: string,
  sort: HouseSort,
  page: number,
  filter: HouseFilter = "all",
): PageSlice<T> {
  const filtered = houses.filter(
    (house) => housePassesFilter(house, filter) && houseMatches(house, query),
  );
  return paginate(sortHouses(filtered, sort), page);
}

export function suggestHouses<T extends HouseBrowseItem>(houses: T[], query: string, limit = 6): T[] {
  const q = normalizeQuery(query);
  const pool = houses.filter((house) => {
    if (!q && house.status === "rejected") return false;
    return houseMatches(house, query);
  });
  return [...pool]
    .sort((a, b) => {
      const boost =
        houseAwesomeness(b) +
        queryMatchBoost(query, b.name, [b.handle, b.city]) -
        (houseAwesomeness(a) + queryMatchBoost(query, a.name, [a.handle, a.city]));
      if (boost !== 0) return boost;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export function shopAwesomeness(shop: ShopBrowseItem): number {
  return shop.pins * 12 + (shop.enabled ? 8 : 0) + shopPriorityScore(shop.id) + (shop.custom ? 3 : 0);
}

export function shopMatches(shop: ShopBrowseItem, query: string): boolean {
  return matchesQuery(query, [shop.name, shop.id, ...shop.domains, shop.enabled ? "on" : "off"]);
}

export function shopPassesFilter(shop: ShopBrowseItem, filter: ShopFilter): boolean {
  if (filter === "on") return shop.enabled;
  if (filter === "off") return !shop.enabled;
  return true;
}

export function sortShops<T extends ShopBrowseItem>(shops: T[], sort: ShopSort): T[] {
  return [...shops].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "pins") return b.pins - a.pins || a.name.localeCompare(b.name);
    if (sort === "on") {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    }
    const awesome = shopAwesomeness(b) - shopAwesomeness(a);
    if (awesome !== 0) return awesome;
    return a.name.localeCompare(b.name);
  });
}

export function browseShops<T extends ShopBrowseItem>(
  shops: T[],
  query: string,
  sort: ShopSort,
  page: number,
  filter: ShopFilter = "all",
): PageSlice<T> {
  const filtered = shops.filter((shop) => shopPassesFilter(shop, filter) && shopMatches(shop, query));
  return paginate(sortShops(filtered, sort), page);
}

export function suggestShops<T extends ShopBrowseItem>(shops: T[], query: string, limit = 6): T[] {
  const pool = shops.filter((shop) => shopMatches(shop, query));
  return [...pool]
    .sort((a, b) => {
      const boost =
        shopAwesomeness(b) +
        queryMatchBoost(query, b.name, b.domains) -
        (shopAwesomeness(a) + queryMatchBoost(query, a.name, a.domains));
      if (boost !== 0) return boost;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export function shopPinCounts(
  looks: Array<{
    tags: Array<{ retailerId?: string; offers?: Array<{ retailerId?: string }> }>;
  }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const look of looks) {
    for (const tag of look.tags) {
      const seen = new Set<string>();
      if (tag.retailerId) seen.add(tag.retailerId);
      for (const offer of tag.offers ?? []) {
        if (offer.retailerId) seen.add(offer.retailerId);
      }
      for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export function houseNote(house: HouseBrowseItem): string {
  if (house.status === "pending") return "Waiting";
  if (house.scouted) return `Scouted · ${house.score}`;
  if (house.score > 0) return `${house.score} · ${house.looks} looks`;
  return house.city || house.handle;
}

export function shopNote(shop: ShopBrowseItem): string {
  if (shop.pins > 0) return `${shop.pins} ${shop.pins === 1 ? "pin" : "pins"}`;
  if (!shop.enabled) return "Off";
  return shop.domains[0] ?? shop.id;
}

export function isHouseSort(value: unknown): value is HouseSort {
  return HOUSE_SORTS.some((item) => item.id === value);
}

export function isShopSort(value: unknown): value is ShopSort {
  return SHOP_SORTS.some((item) => item.id === value);
}

export function isHouseFilter(value: unknown): value is HouseFilter {
  return HOUSE_FILTERS.some((item) => item.id === value);
}

export function isShopFilter(value: unknown): value is ShopFilter {
  return SHOP_FILTERS.some((item) => item.id === value);
}
