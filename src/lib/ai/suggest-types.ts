import type { SearchEngineId } from "@/lib/looks/catalog";

export type CatalogShop = {
  id: string;
  name: string;
  domains: string[];
};

export type SuggestSearchConfig = {
  engine: SearchEngineId;
  country: string;
  braveApiKey: string;
  googleApiKey: string;
  googleCx: string;
  retailers: CatalogShop[];
};

export type SuggestedOffer = {
  url: string;
  price: string;
  currency: string;
  retailerId: string;
  title: string;
  imageUrl?: string;
};

export type SuggestedPiece = {
  name: string;
  brand: string;
  x: number;
  y: number;
  offers: SuggestedOffer[];
};
