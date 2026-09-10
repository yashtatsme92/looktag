export const EDITORIAL_USER_ID = "editorial";

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
};

export type Look = {
  id: string;
  userId: string;
  title: string;
  caption: string;
  creator: string;
  imageSrc: string;
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
  return look.userId === EDITORIAL_USER_ID;
}

export function ownsLook(look: Pick<Look, "userId">, userId: string | null | undefined): boolean {
  return Boolean(userId) && look.userId === userId && look.userId !== EDITORIAL_USER_ID;
}
