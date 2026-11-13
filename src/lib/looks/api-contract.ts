import { z } from "zod";

export const lookIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const listLooksRequestSchema = z.object({});
export const getLookRequestSchema = z.object({ id: lookIdSchema });

const productOfferSchema = z.object({
  id: z.string(),
  url: z.string(),
  price: z.string(),
  currency: z.string(),
  retailerId: z.string(),
  imageUrl: z.string().optional(),
});

const productTagSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  name: z.string(),
  brand: z.string(),
  price: z.string(),
  currency: z.string(),
  url: z.string(),
  retailerId: z.string(),
  offers: z.array(productOfferSchema).optional(),
  wornUrl: z.string().optional(),
  wornRetailerId: z.string().optional(),
  styleId: z.string().optional(),
});

export const lookImagesSchema = z.object({
  thumb: z.string(),
  card: z.string(),
  detail: z.string(),
  jpeg: z.object({
    thumb: z.string(),
    card: z.string(),
    detail: z.string(),
  }),
  avif: z
    .object({
      thumb: z.string(),
      card: z.string(),
      detail: z.string(),
    })
    .optional(),
  width: z.number(),
  height: z.number(),
  srcWidth: z.object({
    thumb: z.number(),
    card: z.number(),
    detail: z.number(),
  }),
  original: z.string().optional(),
});

export const lookResponseSchema = z.object({
  id: lookIdSchema,
  userId: z.string(),
  title: z.string(),
  caption: z.string(),
  creator: z.string(),
  imageSrc: z.string(),
  images: lookImagesSchema.optional(),
  crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  tags: z.array(productTagSchema),
  moods: z.array(z.string()).optional(),
  collectionId: z.string().optional(),
});

export const listLooksResponseSchema = z.array(lookResponseSchema);
export const getLookResponseSchema = lookResponseSchema;
export const looksApiErrorSchema = z.object({ error: z.string() });
