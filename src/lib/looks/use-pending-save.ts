import { useEffect } from "react";
import { toast } from "sonner";
import { track } from "@/lib/analytics/runtime";
import { takePendingSave } from "@/lib/looks/pending-save";
import { carryOverSave, useSavedLooks } from "@/lib/looks/saved";

/** After sign-in, finish the save the guest started. An id already stored is not added twice. */
export function useResumePendingSave(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const id = takePendingSave();
    if (!id) return;
    track("auth_action_resumed", { source: "save" });
    const store = useSavedLooks.getState();
    store.hydrate();
    const current = useSavedLooks.getState().ids;
    const merged = carryOverSave(current, id);
    if (merged.length !== current.length) store.replace(merged);
    toast.success("Saved");
  }, [signedIn]);
}
