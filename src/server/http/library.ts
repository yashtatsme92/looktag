import { isSameSiteAllowed } from "@/lib/auth/same-site";
import {
  accountApiErrorSchema,
  accountIdSchema,
  deleteCreatorFollowResponseSchema,
  deleteHouseFollowResponseSchema,
  deleteSaveResponseSchema,
  listFollowsResponseSchema,
  listSavesResponseSchema,
  mergeGuestRequestSchema,
  mergeGuestResponseSchema,
  putCreatorFollowResponseSchema,
  putHouseFollowResponseSchema,
  putSaveResponseSchema,
} from "@/lib/account/api-contract";
import { lookIdSchema } from "@/lib/looks/api-contract";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const errorBody = (error: string) => accountApiErrorSchema.parse({ error });

async function accountUser(request: Request): Promise<{ userId: string } | Response> {
  if (!isSameSiteAllowed(request.headers, request.method)) {
    return json(errorBody("Forbidden"), 403);
  }
  const { userFromRequest } = await import("@/lib/auth/request-user.server");
  const user = await userFromRequest(request);
  if (!user) return json(errorBody("Unauthorized"), 401);
  return { userId: user.id };
}

function isUser(value: { userId: string } | Response): value is { userId: string } {
  return !(value instanceof Response);
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export async function handleListSaves(request: Request) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  try {
    const { listSaves } = await import("@/server/services/saves");
    const saves = await listSaves(await sqlClient(), user.userId);
    return json(listSavesResponseSchema.parse({ saves }), 200);
  } catch (error) {
    console.error("[api/v1/me/saves] list failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handlePutSave(request: Request, lookId: string) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  const parsed = lookIdSchema.safeParse(lookId);
  if (!parsed.success) return json(errorBody("Bad request"), 400);
  try {
    const { addSave } = await import("@/server/services/saves");
    const result = await addSave(await sqlClient(), user.userId, parsed.data);
    if (result.status === "missing") return json(errorBody("Not found"), 404);
    return json(putSaveResponseSchema.parse({ lookId: parsed.data, saved: true, createdAt: result.createdAt }), 200);
  } catch (error) {
    console.error("[api/v1/me/saves] put failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handleDeleteSave(request: Request, lookId: string) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  const parsed = lookIdSchema.safeParse(lookId);
  if (!parsed.success) return json(errorBody("Bad request"), 400);
  try {
    const { removeSave } = await import("@/server/services/saves");
    await removeSave(await sqlClient(), user.userId, parsed.data);
    return json(deleteSaveResponseSchema.parse({ lookId: parsed.data, saved: false }), 200);
  } catch (error) {
    console.error("[api/v1/me/saves] delete failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handleListFollows(request: Request) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  try {
    const { listFollows } = await import("@/server/services/follows");
    const follows = await listFollows(await sqlClient(), user.userId);
    return json(listFollowsResponseSchema.parse(follows), 200);
  } catch (error) {
    console.error("[api/v1/me/follows] list failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handlePutCreatorFollow(request: Request, creatorUserId: string) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  const parsed = accountIdSchema.safeParse(creatorUserId);
  if (!parsed.success) return json(errorBody("Bad request"), 400);
  try {
    const { addCreatorFollow } = await import("@/server/services/follows");
    const result = await addCreatorFollow(await sqlClient(), user.userId, parsed.data);
    if (result.status === "self") return json(errorBody("Cannot follow yourself"), 400);
    if (result.status === "missing") return json(errorBody("Not found"), 404);
    return json(
      putCreatorFollowResponseSchema.parse({ userId: parsed.data, following: true, createdAt: result.createdAt }),
      200,
    );
  } catch (error) {
    console.error("[api/v1/me/follows] creator put failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handleDeleteCreatorFollow(request: Request, creatorUserId: string) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  const parsed = accountIdSchema.safeParse(creatorUserId);
  if (!parsed.success) return json(errorBody("Bad request"), 400);
  try {
    const { removeCreatorFollow } = await import("@/server/services/follows");
    await removeCreatorFollow(await sqlClient(), user.userId, parsed.data);
    return json(deleteCreatorFollowResponseSchema.parse({ userId: parsed.data, following: false }), 200);
  } catch (error) {
    console.error("[api/v1/me/follows] creator delete failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handlePutHouseFollow(request: Request, labelId: string) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  const parsed = accountIdSchema.safeParse(labelId);
  if (!parsed.success) return json(errorBody("Bad request"), 400);
  try {
    const { addHouseFollow } = await import("@/server/services/follows");
    const result = await addHouseFollow(await sqlClient(), user.userId, parsed.data);
    if (result.status === "missing") return json(errorBody("Not found"), 404);
    return json(
      putHouseFollowResponseSchema.parse({ labelId: parsed.data, following: true, createdAt: result.createdAt }),
      200,
    );
  } catch (error) {
    console.error("[api/v1/me/follows] house put failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handleDeleteHouseFollow(request: Request, labelId: string) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  const parsed = accountIdSchema.safeParse(labelId);
  if (!parsed.success) return json(errorBody("Bad request"), 400);
  try {
    const { removeHouseFollow } = await import("@/server/services/follows");
    await removeHouseFollow(await sqlClient(), user.userId, parsed.data);
    return json(deleteHouseFollowResponseSchema.parse({ labelId: parsed.data, following: false }), 200);
  } catch (error) {
    console.error("[api/v1/me/follows] house delete failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}

export async function handleMergeGuest(request: Request) {
  const user = await accountUser(request);
  if (!isUser(user)) return user;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(errorBody("Bad request"), 400);
  }
  const parsed = mergeGuestRequestSchema.safeParse(body);
  if (!parsed.success) return json(errorBody("Bad request"), 400);
  try {
    const { mergeGuestSaves } = await import("@/server/services/saves");
    const { mergeGuestCreators, mergeGuestHouses } = await import("@/server/services/follows");
    const sql = await sqlClient();
    const [saves, creators, houses] = await Promise.all([
      mergeGuestSaves(sql, user.userId, parsed.data.saves),
      mergeGuestCreators(sql, user.userId, parsed.data.creators),
      mergeGuestHouses(sql, user.userId, parsed.data.houses),
    ]);
    return json(mergeGuestResponseSchema.parse({ saves, creators, houses }), 200);
  } catch (error) {
    console.error("[api/v1/me/merge-guest] failed", error);
    return json(errorBody("Internal server error"), 500);
  }
}
