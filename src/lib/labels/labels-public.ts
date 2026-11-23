import { createServerFn } from "@tanstack/react-start";

export const getHousesAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const { getHousesAvailability: get } = await import("@/server/services/houses");
  return get();
});

export const listFashionLabels = createServerFn({ method: "GET" }).handler(async () => {
  const { listFashionLabels: list } = await import("@/server/services/houses");
  return list();
});

export const listFashionCollections = createServerFn({ method: "GET" }).handler(async () => {
  const { listFashionCollections: list } = await import("@/server/services/houses");
  return list();
});

export const getFashionLabel = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const { getFashionLabel: get } = await import("@/server/services/houses");
    return get(data);
  });

export const getFashionCollection = createServerFn({ method: "GET" })
  .validator((input: { labelId: string; collectionId: string }) => input)
  .handler(async ({ data }) => {
    const { getFashionCollection: get } = await import("@/server/services/houses");
    return get(data);
  });

export const listFashionStyles = createServerFn({ method: "GET" }).handler(async () => {
  const { listFashionStyles: list } = await import("@/server/services/houses");
  return list();
});

export const listRankedLabels = createServerFn({ method: "GET" }).handler(async () => {
  const { listRankedLabels: list } = await import("@/server/services/houses");
  return list();
});
