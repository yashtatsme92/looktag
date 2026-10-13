import { useEffect } from "react";
import { toast } from "sonner";
import { takePendingSave } from "@/lib/looks/pending-save";
import { useSavedLooks } from "@/lib/looks/saved";

/** After sign-in, finish the save the guest started. */
export function useResumePendingSave(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    const id = takePendingSave();
    if (!id) return;
    const store = useSavedLooks.getState();
    store.hydrate();
    if (!store.has(id)) {
      store.toggle(id);
      toast.success("Saved");
    }
  }, [signedIn]);
}
