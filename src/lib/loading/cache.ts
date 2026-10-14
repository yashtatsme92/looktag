export type LoadCacheEntry<T> = {
  value: T;
  scrollY: number | null;
};

export type LoadCache = {
  get<T>(key: string): LoadCacheEntry<T> | undefined;
  set<T>(key: string, value: T, scrollY?: number | null): void;
  delete(key: string): void;
  clear(): void;
};

export function createLoadCache(): LoadCache {
  const entries = new Map<string, LoadCacheEntry<unknown>>();

  return {
    get<T>(key: string) {
      return entries.get(key) as LoadCacheEntry<T> | undefined;
    },
    set<T>(key: string, value: T, scrollY?: number | null) {
      const savedScrollY =
        scrollY ?? (typeof window === "undefined" ? null : window.scrollY);
      entries.delete(key);
      entries.set(key, { value, scrollY: savedScrollY });
      if (entries.size > 100) {
        entries.delete(entries.keys().next().value as string);
      }
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

export const loadingCache = createLoadCache();
