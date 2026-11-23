import { z } from "zod";
import { lookIdSchema } from "../looks/api-contract.ts";

/** Creator and house ids share the look id shape. */
export const accountIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const GUEST_MERGE_LIMIT = 500;

const createdAtSchema = z.string().datetime();

export const saveItemSchema = z.object({
  lookId: lookIdSchema,
  createdAt: createdAtSchema,
});

export const listSavesResponseSchema = z.object({
  saves: z.array(saveItemSchema),
});

export const putSaveResponseSchema = z.object({
  lookId: lookIdSchema,
  saved: z.literal(true),
  createdAt: createdAtSchema,
});

export const deleteSaveResponseSchema = z.object({
  lookId: lookIdSchema,
  saved: z.literal(false),
});

export const creatorFollowSchema = z.object({
  userId: accountIdSchema,
  createdAt: createdAtSchema,
});

export const houseFollowSchema = z.object({
  labelId: accountIdSchema,
  createdAt: createdAtSchema,
});

export const listFollowsResponseSchema = z.object({
  creators: z.array(creatorFollowSchema),
  houses: z.array(houseFollowSchema),
});

export const putCreatorFollowResponseSchema = z.object({
  userId: accountIdSchema,
  following: z.literal(true),
  createdAt: createdAtSchema,
});

export const deleteCreatorFollowResponseSchema = z.object({
  userId: accountIdSchema,
  following: z.literal(false),
});

export const putHouseFollowResponseSchema = z.object({
  labelId: accountIdSchema,
  following: z.literal(true),
  createdAt: createdAtSchema,
});

export const deleteHouseFollowResponseSchema = z.object({
  labelId: accountIdSchema,
  following: z.literal(false),
});

export const mergeGuestRequestSchema = z.object({
  saves: z.array(lookIdSchema).max(GUEST_MERGE_LIMIT).default([]),
  creators: z.array(accountIdSchema).max(GUEST_MERGE_LIMIT).default([]),
  houses: z.array(accountIdSchema).max(GUEST_MERGE_LIMIT).default([]),
});

export const mergeGuestResponseSchema = z.object({
  saves: z.array(lookIdSchema),
  creators: z.array(accountIdSchema),
  houses: z.array(accountIdSchema),
});

export const accountApiErrorSchema = z.object({ error: z.string() });

export const setSaveInputSchema = z.object({
  lookId: lookIdSchema,
  saved: z.boolean(),
});

export const setCreatorFollowInputSchema = z.object({
  userId: accountIdSchema,
  following: z.boolean(),
});

export const setHouseFollowInputSchema = z.object({
  labelId: accountIdSchema,
  following: z.boolean(),
});
