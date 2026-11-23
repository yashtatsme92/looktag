import {
  EDITORIAL_USER_ID,
  type Look,
  type ProductOffer,
  type ProductTag,
} from "@looktag/shared/look-types";
export {
  EDITORIAL_USER_ID,
  type CropRect,
  type Look,
  type LookImages,
  type ProductOffer,
  type ProductTag,
} from "@looktag/shared/look-types";

export function isSeedCreatorId(userId: string | null | undefined): boolean {
  return Boolean(userId) && (userId === EDITORIAL_USER_ID || String(userId).startsWith("seed-"));
}

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
