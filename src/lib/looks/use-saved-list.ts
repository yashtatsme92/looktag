import { useLayoutEffect } from "react";
import { savedLooksForPage, useSavedLooks } from "@/lib/looks/saved";
import { useLooksStore } from "@/lib/looks/store";
import type { Look } from "@/lib/looks/types";

/** Saved ids joined to published looks. Missing, deleted, and unpublished ids are skipped. */
export function useSavedLookList(): { looks: Look[]; pending: boolean } {
  const hydrateIds = useSavedLooks((s) => s.hydrate);
  const ids = useSavedLooks((s) => s.ids);
  const hydrateLooks = useLooksStore((s) => s.hydrate);
  const memoryLooks = useLooksStore((s) => s.looks);
  const publishedLooks = useLooksStore((s) => s.publishedLooks);
  const catalogSettled = useLooksStore((s) => s.catalogSettled);

  useLayoutEffect(() => {
    hydrateIds();
    hydrateLooks();
  }, [hydrateIds, hydrateLooks]);

  const looks = savedLooksForPage({ savedIds: ids, memoryLooks, publishedLooks });
  const pending = !catalogSettled && ids.length > 0 && looks.length === 0;
  return { looks, pending };
}
