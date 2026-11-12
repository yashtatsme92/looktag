import type { CropRect } from "./crop";
import type { LookImages } from "./image-variants";

export const EDITORIAL_USER_ID = "editorial";

export function isSeedCreatorId(userId: string | null | undefined): boolean {
  return Boolean(userId) && (userId === EDITORIAL_USER_ID || String(userId).startsWith("seed-"));
}

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
  /** Optional House Style this pin points at. Absent means a plain pin. */
  styleId?: string;
};

export type Look = {
  id: string;
  userId: string;
  title: string;
  caption: string;
  creator: string;
  imageSrc: string;
  /** Sized WebP/JPEG URLs when the photo lives in object storage. */
  images?: LookImages;
  crop?: CropRect;
  createdAt: number;
  updatedAt: number;
  tags: ProductTag[];
  moods?: string[];
  collectionId?: string;
};

export function emptyLook(partial?: Partial<Look>): Look {
  return {
    id: crypto.randomUUID(),
    userId: "",
    title: "",
    caption: "",
    creator: "You",
    imageSrc: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: [],
    ...partial,
  };
}

export function emptyOffer(): ProductOffer {
  return {
    id: crypto.randomUUID(),
    url: "",
    price: "",
    currency: "EUR",
    retailerId: "",
  };
}

export function emptyTag(x: number, y: number): ProductTag {
  return {
    id: crypto.randomUUID(),
    x,
    y,
    name: "",
    brand: "",
    price: "",
    currency: "EUR",
    url: "",
    retailerId: "",
    offers: [],
    wornUrl: "",
    wornRetailerId: "",
  };
}

export function isEditorialLook(look: Pick<Look, "userId">): boolean {
  return isSeedCreatorId(look.userId);
}

export function ownsLook(look: Pick<Look, "userId">, userId: string | null | undefined): boolean {
  return Boolean(userId) && look.userId === userId && !isSeedCreatorId(look.userId);
}
