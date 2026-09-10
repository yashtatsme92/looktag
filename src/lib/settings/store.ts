import { create } from "zustand";
import { getAppSettings, saveAppSettings } from "./api";
import { DEFAULT_SETTINGS, type AppSettings } from "./model";

type SettingsState = AppSettings & {
  hydrated: boolean;
  hydrate: () => void;
  save: (patch: Partial<AppSettings>) => Promise<AppSettings>;
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  let load = 0;
  let writes: Promise<unknown> = Promise.resolve();
  return {
    ...DEFAULT_SETTINGS,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated) return;
      const id = ++load;
      const failSafe =
        typeof window === "undefined"
          ? undefined
          : window.setTimeout(() => {
              if (!get().hydrated) set({ hydrated: true });
            }, 2500);
      void getAppSettings()
        .then((settings) => {
          if (failSafe) window.clearTimeout(failSafe);
          if (id !== load) return;
          set({ ...settings, hydrated: true });
        })
        .catch(() => {
          if (failSafe) window.clearTimeout(failSafe);
          if (id !== load) return;
          set({ hydrated: true });
        });
    },
    save: (patch) => {
      load += 1;
      set((state) => ({ ...state, ...patch }));
      const run = async () => {
        const saved = await saveAppSettings({ data: patch });
        set({ ...saved, hydrated: true });
        return saved;
      };
      const next = writes.then(run, run);
      writes = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
});
