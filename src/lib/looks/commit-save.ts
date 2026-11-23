import { noteLook } from "./store";
import { applySaveTap, useSavedLooks } from "./saved";
import type { Look } from "./types";

/** Write the device list. A new save keeps the look so Saved can paint it before the catalog returns. */
export function commitLookSave(look: Look, signedIn: boolean): { saved: boolean; promptSignIn: boolean } {
  const store = useSavedLooks.getState();
  store.hydrate();
  const next = applySaveTap({ ids: useSavedLooks.getState().ids, lookId: look.id, signedIn });
  if (next.saved) noteLook(look);
  store.replace(next.ids);
  return { saved: next.saved, promptSignIn: next.promptSignIn };
}
