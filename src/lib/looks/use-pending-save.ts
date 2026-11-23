import { useEffect } from "react";
import { toast } from "sonner";
import { authEnabled } from "@/lib/auth/client";
import { track } from "@/lib/analytics/runtime";
import { takePendingSave } from "@/lib/looks/pending-save";
import { useSavedLooks } from "@/lib/looks/saved";

/**
 * After sign-in, finish the save the guest started.
 * Auth-on accounts merge the pending id in the shell, so this only covers auth-off.
 */
export function useResumePendingSave(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || authEnabled) return;
    const id = takePendingSave();
    if (!id) return;
    track("auth_action_resumed", { source: "save" });
    const store = useSavedLooks.getState();
    store.hydrate();
    if (!store.has(id)) {
      store.toggle(id);
      toast.success("Saved");
    }
  }, [signedIn]);
}