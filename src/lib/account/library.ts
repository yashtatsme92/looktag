import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { track } from "@/lib/analytics/runtime";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { userMessage } from "@/lib/errors/user-message";
import { CREATOR_FOLLOWS_KEY, HOUSE_FOLLOWS_KEY, readStoredIds } from "@/lib/home/follows";
import { clearPendingSave, peekPendingSave } from "@/lib/looks/pending-save";
import { resetDeviceSaves, useSavedLooks } from "@/lib/looks/saved";
import {
  listAccountLibrary,
  mergeGuestLibrary,
  setAccountCreatorFollow,
  setAccountHouseFollow,
  setAccountSave,
} from "./api";

const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MERGE_CAP = 500;

type LibraryStatus = "idle" | "loading" | "ready" | "error";

type LibraryState = {
  userId: string | null;
  status: LibraryStatus;
  saves: string[];
  creators: string[];
  houses: string[];
  ensure: (userId: string) => Promise<void>;
  reload: (userId: string) => Promise<void>;
  clear: () => void;
  toggleSave: (lookId: string) => Promise<boolean>;
  toggleCreator: (creatorId: string) => Promise<boolean>;
  toggleHouse: (labelId: string) => Promise<boolean>;
};

let mutation = 0;
let loadFlight: Promise<void> | null = null;
let loadUser: string | null = null;

function applyList(
  userId: string,
  data: {
    saves: { lookId: string }[];
    creators: { userId: string }[];
    houses: { labelId: string }[];
  },
  stamp: number,
) {
  if (stamp !== mutation) return;
  const state = useAccountLibrary.getState();
  if (state.userId !== userId) return;
  useAccountLibrary.setState({
    userId,
    status: "ready",
    saves: data.saves.map((row) => row.lookId),
    creators: data.creators.map((row) => row.userId),
    houses: data.houses.map((row) => row.labelId),
  });
}

export const useAccountLibrary = create<LibraryState>((set, get) => ({
  userId: null,
  status: "idle",
  saves: [],
  creators: [],
  houses: [],
  ensure: (userId) => {
    if (get().userId === userId && get().status === "ready") return Promise.resolve();
    if (loadFlight && loadUser === userId) return loadFlight;
    return get().reload(userId);
  },
  reload: (userId) => {
    const stamp = mutation;
    if (get().userId !== userId) {
      set({ userId, status: "loading", saves: [], creators: [], houses: [] });
    } else if (get().status !== "ready") {
      set({ status: "loading" });
    }
    loadUser = userId;
    loadFlight = listAccountLibrary()
      .then((data) => {
        applyList(userId, data, stamp);
      })
      .catch(() => {
        if (stamp !== mutation) return;
        if (get().userId === userId) set({ status: "error" });
      })
      .finally(() => {
        if (loadUser === userId) loadFlight = null;
      });
    return loadFlight;
  },
  clear: () => {
    mutation += 1;
    loadFlight = null;
    loadUser = null;
    set({ userId: null, status: "idle", saves: [], creators: [], houses: [] });
  },
  toggleSave: async (lookId) => {
    mutation += 1;
    const prev = get().saves;
    const saved = !prev.includes(lookId);
    const next = saved ? [lookId, ...prev.filter((id) => id !== lookId)] : prev.filter((id) => id !== lookId);
    set({ saves: next, status: "ready" });
    try {
      await setAccountSave({ data: { lookId, saved } });
      return saved;
    } catch (error) {
      mutation += 1;
      set({ saves: prev });
      toast.error(userMessage(error));
      throw error;
    }
  },
  toggleCreator: async (creatorId) => {
    mutation += 1;
    const prev = get().creators;
    const following = !prev.includes(creatorId);
    const next = following ? [creatorId, ...prev.filter((id) => id !== creatorId)] : prev.filter((id) => id !== creatorId);
    set({ creators: next, status: "ready" });
    try {
      await setAccountCreatorFollow({ data: { userId: creatorId, following } });
      return following;
    } catch (error) {
      mutation += 1;
      set({ creators: prev });
      toast.error(userMessage(error));
      throw error;
    }
  },
  toggleHouse: async (labelId) => {
    mutation += 1;
    const prev = get().houses;
    const following = !prev.includes(labelId);
    const next = following ? [labelId, ...prev.filter((id) => id !== labelId)] : prev.filter((id) => id !== labelId);
    set({ houses: next, status: "ready" });
    try {
      await setAccountHouseFollow({ data: { labelId, following } });
      return following;
    } catch (error) {
      mutation += 1;
      set({ houses: prev });
      toast.error(userMessage(error));
      throw error;
    }
  },
}));

function validIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!DEVICE_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MERGE_CAP) break;
  }
  return out;
}

function clearDeviceFollows() {
  try {
    localStorage.removeItem(CREATOR_FOLLOWS_KEY);
    localStorage.removeItem(HOUSE_FOLLOWS_KEY);
  } catch {
    // private mode
  }
}

const mergeFlights = new Map<string, Promise<void>>();

/** Copy device saves and follows into the account once, then drop the device keys. */
export function mergeDeviceIntoAccount(userId: string): Promise<void> {
  const pendingId = peekPendingSave();
  const saves = validIds([...(pendingId ? [pendingId] : []), ...readStoredIds("looktag-saved-v1")]);
  const creators = validIds(readStoredIds(CREATOR_FOLLOWS_KEY));
  const houses = validIds(readStoredIds(HOUSE_FOLLOWS_KEY));
  if (saves.length === 0 && creators.length === 0 && houses.length === 0) {
    return useAccountLibrary.getState().ensure(userId);
  }
  const existing = mergeFlights.get(userId);
  if (existing) return existing;
  const job = (async () => {
    await mergeGuestLibrary({ data: { saves, creators, houses } });
    resetDeviceSaves();
    clearDeviceFollows();
    clearPendingSave();
    if (pendingId) {
      track("auth_action_resumed", { source: "save" });
      toast.success("Saved");
    }
    await useAccountLibrary.getState().reload(userId);
  })();
  mergeFlights.set(userId, job);
  void job.finally(() => {
    if (mergeFlights.get(userId) === job) mergeFlights.delete(userId);
  });
  return job;
}

/** Signed-in saves hit the account. Guests stay on the sign-in gate. Auth-off stays on the device. */
export async function toggleLookSave(sessionUser: { id: string } | null, lookId: string): Promise<boolean | "guest"> {
  if (authEnabled && !sessionUser) return "guest";
  if (authEnabled && sessionUser) return useAccountLibrary.getState().toggleSave(lookId);
  const store = useSavedLooks.getState();
  if (!store.hydrated) store.hydrate();
  return store.toggle(lookId);
}

/** Account ids when signed in. Device ids otherwise. */
export function useSavedLookIds(): string[] {
  const { user } = useCurrentUserState();
  const deviceIds = useSavedLooks((s) => s.ids);
  const hydrate = useSavedLooks((s) => s.hydrate);
  const saves = useAccountLibrary((s) => s.saves);
  useEffect(() => {
    if (authEnabled && user?.id) {
      void mergeDeviceIntoAccount(user.id);
      return;
    }
    hydrate();
  }, [hydrate, user?.id]);
  if (authEnabled && user?.id) return saves;
  return deviceIds;
}

/** True while a signed-in list has not arrived and there is nothing optimistic to show. */
export function useAccountSavedLoading(userId: string | null | undefined): boolean {
  const status = useAccountLibrary((s) => s.status);
  const accountUser = useAccountLibrary((s) => s.userId);
  const saves = useAccountLibrary((s) => s.saves);
  if (!authEnabled || !userId) return false;
  if (accountUser === userId && saves.length > 0) return false;
  return accountUser !== userId || status === "idle" || status === "loading";
}
