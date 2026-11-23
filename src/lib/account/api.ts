import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { PublicError } from "@/lib/errors/public-error";
import {
  listFollowsResponseSchema,
  listSavesResponseSchema,
  mergeGuestRequestSchema,
  mergeGuestResponseSchema,
  setCreatorFollowInputSchema,
  setHouseFollowInputSchema,
  setSaveInputSchema,
} from "./api-contract";

function reject(message: string, status: number): never {
  throw new PublicError(message, { status });
}

export const listAccountLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { listSaves } = await import("@/server/services/saves");
    const { listFollows } = await import("@/server/services/follows");
    const sql = await getSql();
    const [saves, follows] = await Promise.all([
      listSaves(sql, context.userId),
      listFollows(sql, context.userId),
    ]);
    return {
      saves: listSavesResponseSchema.parse({ saves }).saves,
      creators: listFollowsResponseSchema.parse(follows).creators,
      houses: listFollowsResponseSchema.parse(follows).houses,
    };
  });

export const setAccountSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const parsed = setSaveInputSchema.safeParse(input);
    if (!parsed.success) reject("Check that and try again.", 400);
    return parsed.data;
  })
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { addSave, removeSave } = await import("@/server/services/saves");
    const sql = await getSql();
    if (!data.saved) {
      await removeSave(sql, context.userId, data.lookId);
      return { lookId: data.lookId, saved: false as const };
    }
    const result = await addSave(sql, context.userId, data.lookId);
    if (result.status === "missing") reject("That look is no longer available.", 404);
    return { lookId: data.lookId, saved: true as const, createdAt: result.createdAt };
  });

export const setAccountCreatorFollow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const parsed = setCreatorFollowInputSchema.safeParse(input);
    if (!parsed.success) reject("Check that and try again.", 400);
    return parsed.data;
  })
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { addCreatorFollow, removeCreatorFollow } = await import("@/server/services/follows");
    const sql = await getSql();
    if (!data.following) {
      await removeCreatorFollow(sql, context.userId, data.userId);
      return { userId: data.userId, following: false as const };
    }
    const result = await addCreatorFollow(sql, context.userId, data.userId);
    if (result.status === "self") reject("You cannot follow yourself.", 400);
    if (result.status === "missing") reject("That creator is not on Looktag.", 404);
    return { userId: data.userId, following: true as const, createdAt: result.createdAt };
  });

export const setAccountHouseFollow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const parsed = setHouseFollowInputSchema.safeParse(input);
    if (!parsed.success) reject("Check that and try again.", 400);
    return parsed.data;
  })
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { addHouseFollow, removeHouseFollow } = await import("@/server/services/follows");
    const sql = await getSql();
    if (!data.following) {
      await removeHouseFollow(sql, context.userId, data.labelId);
      return { labelId: data.labelId, following: false as const };
    }
    const result = await addHouseFollow(sql, context.userId, data.labelId);
    if (result.status === "missing") reject("That house is not on Looktag.", 404);
    return { labelId: data.labelId, following: true as const, createdAt: result.createdAt };
  });

export const mergeGuestLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const parsed = mergeGuestRequestSchema.safeParse(input ?? {});
    if (!parsed.success) reject("Check that and try again.", 400);
    return parsed.data;
  })
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const { mergeGuestSaves } = await import("@/server/services/saves");
    const { mergeGuestCreators, mergeGuestHouses } = await import("@/server/services/follows");
    const sql = await getSql();
    const [saves, creators, houses] = await Promise.all([
      mergeGuestSaves(sql, context.userId, data.saves),
      mergeGuestCreators(sql, context.userId, data.creators),
      mergeGuestHouses(sql, context.userId, data.houses),
    ]);
    return mergeGuestResponseSchema.parse({ saves, creators, houses });
  });
