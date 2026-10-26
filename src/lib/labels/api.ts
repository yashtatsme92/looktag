import { memoPromise } from "@/lib/loading/memo-promise";
import {
  getHousesAvailability as getHousesAvailabilityFn,
  listFashionCollections as listFashionCollectionsFn,
  listFashionLabels as listFashionLabelsFn,
  listFashionStyles as listFashionStylesFn,
} from "./labels-public";
import { getMyHouse as getMyHouseFn } from "./labels-owner";

export type { FashionLabelPage, FashionCollectionPage, AdminHouse } from "./labels-shared";
export { ensureFashionLabels } from "./labels-shared";
export {
  getFashionLabel,
  getFashionCollection,
  listRankedLabels,
} from "./labels-public";

/** Client reads share one in-flight promise so the phone and wide trees cannot double-fetch. */
export function getHousesAvailability() {
  return memoPromise("houses-open", () => getHousesAvailabilityFn());
}
export function listFashionLabels() {
  return memoPromise("labels", () => listFashionLabelsFn());
}
export function listFashionCollections() {
  return memoPromise("collections", () => listFashionCollectionsFn());
}
export function listFashionStyles() {
  return memoPromise("styles", () => listFashionStylesFn());
}

export { setLabelScouted, listAdminHouses, setHouseStatus } from "./labels-admin";
export function getMyHouse() {
  return memoPromise("my-house", () => getMyHouseFn());
}
export {
  applyHouse,
  updateMyHouse,
  listMyCollections,
  saveMyCollection,
  deleteMyCollection,
  moveMyCollection,
  listMyStyles,
  saveMyStyle,
  deleteMyStyle,
  moveMyStyle,
} from "./labels-owner";
