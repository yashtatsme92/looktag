import { createServerFn } from "@tanstack/react-start";

export const listPublicLooks = createServerFn({ method: "GET" }).handler(async () => {
  const { listPublicLooks: list } = await import("@/server/services/looks");
  return list();
});

export const getLookById = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const { getLookById: get } = await import("@/server/services/looks");
    return get(data);
  });

export const listRankedCreators = createServerFn({ method: "GET" }).handler(async () => {
  const { listRankedCreators: list } = await import("@/server/services/looks");
  return list();
});

export const getCreator = createServerFn({ method: "GET" })
  .validator((userId: string) => userId)
  .handler(async ({ data }) => {
    const { getCreator: get } = await import("@/server/services/profiles");
    return get(data);
  });
