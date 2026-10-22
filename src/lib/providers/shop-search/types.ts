export type ShopSearchProviderName = "brave" | "google-cse" | "duckduckgo";

export type ShopRegion = { id: string; name: string };

export type ShopHit = {
  url: string;
  title?: string;
  snippet?: string;
  imageUrl?: string;
};

export interface ShopSearch {
  search(query: string, region: ShopRegion, domains: string[]): Promise<ShopHit[]>;
}
