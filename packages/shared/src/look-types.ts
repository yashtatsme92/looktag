export const EDITORIAL_USER_ID = "editorial";

export type CropRect = { x: number; y: number; w: number; h: number };

export type LookImageSizeUrls = {
  thumb: string;
  feed: string;
  card: string;
  detail: string;
};

export type LookImages = {
  thumb: string;
  feed: string;
  card: string;
  detail: string;
  jpeg: LookImageSizeUrls;
  avif?: LookImageSizeUrls;
  width: number;
  height: number;
  srcWidth: { thumb: number; feed: number; card: number; detail: number };
  original?: string;
};

export type ProductOffer = {
  id: string;
  url: string;
  price: string;
  currency: string;
  retailerId: string;
  imageUrl?: string;
};

export type ProductTag = {
  id: string;
  x: number;
  y: number;
  name: string;
  brand: string;
  price: string;
  currency: string;
  url: string;
  retailerId: string;
  offers?: ProductOffer[];
  wornUrl?: string;
  wornRetailerId?: string;
  styleId?: string;
};

export type Look = {
  id: string;
  userId: string;
  title: string;
  caption: string;
  creator: string;
  imageSrc: string;
  images?: LookImages;
  crop?: CropRect;
  createdAt: number;
  updatedAt: number;
  tags: ProductTag[];
  moods?: string[];
  collectionId?: string;
};
