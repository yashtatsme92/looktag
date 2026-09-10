import { create } from "zustand";
import { RETAILERS, type Retailer } from "./retailers";
import { useSettingsStore } from "@/lib/settings/store";

export type SearchEngineId = "xai" | "duckduckgo" | "brave" | "google";

export type CatalogRetailer = Retailer & {
  enabled: boolean;
  custom: boolean;
};

export type CatalogSnapshot = {
  retailers: CatalogRetailer[];
  searchEngine: SearchEngineId;
  braveApiKey: string;
  googleApiKey: string;
  googleCx: string;
  searchCountry: string;
};

const STORAGE_KEY = "looktag-catalog-v1";

export const SEARCH_ENGINES: {
  id: SearchEngineId;
  name: string;
  hint: string;
}[] = [
  {
    id: "xai",
    name: "Grok",
    hint: "Reads the look photo, then finds live product pages. No extra key.",
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    hint: "Searches the open web. No key. Grok still reads the photo.",
  },
  {
    id: "brave",
    name: "Brave Search",
    hint: "Paste a Brave Search API key. Restricts results to shops you leave on.",
  },
  {
    id: "google",
    name: "Google Programmable Search",
    hint: "Paste an API key and a search engine ID (cx).",
  },
];

function defaultRetailers(): CatalogRetailer[] {
  return RETAILERS.map((retailer) => ({
    ...retailer,
    enabled: true,
    custom: false,
  }));
}

export function defaultCatalog(): CatalogSnapshot {
  return {
    retailers: defaultRetailers(),
    searchEngine: "xai",
    braveApiKey: "",
    googleApiKey: "",
    googleCx: "",
    searchCountry: "DE",
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 28);
  return base || `shop${Date.now().toString(36)}`;
}

export function parseDomains(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, ""),
    )
    .filter((domain) => domain.includes("."));
}

function readCatalog(): CatalogSnapshot {
  const fallback = defaultCatalog();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CatalogSnapshot>;
    const byId = new Map(fallback.retailers.map((retailer) => [retailer.id, retailer]));
    if (Array.isArray(parsed.retailers)) {
      for (const row of parsed.retailers) {
        if (!row || typeof row.id !== "string") continue;
        const builtin = byId.get(row.id);
        if (builtin) {
          byId.set(row.id, {
            ...builtin,
            enabled: row.enabled !== false,
            name: typeof row.name === "string" && row.name.trim() ? row.name : builtin.name,
            domains:
              Array.isArray(row.domains) && row.domains.length > 0 ? row.domains : builtin.domains,
          });
        } else if (row.custom && row.name && Array.isArray(row.domains) && row.domains.length) {
          byId.set(row.id, {
            id: row.id,
            name: row.name,
            domains: row.domains,
            enabled: row.enabled !== false,
            custom: true,
          });
        }
      }
    }
    const engine = SEARCH_ENGINES.some((item) => item.id === parsed.searchEngine)
      ? (parsed.searchEngine as SearchEngineId)
      : "xai";
    return {
      retailers: [...byId.values()],
      searchEngine: engine,
      braveApiKey: typeof parsed.braveApiKey === "string" ? parsed.braveApiKey : "",
      googleApiKey: typeof parsed.googleApiKey === "string" ? parsed.googleApiKey : "",
      googleCx: typeof parsed.googleCx === "string" ? parsed.googleCx : "",
      searchCountry:
        typeof parsed.searchCountry === "string" && parsed.searchCountry.length === 2
          ? parsed.searchCountry.toUpperCase()
          : "DE",
    };
  } catch {
    return fallback;
  }
}

function writeCatalog(state: CatalogSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode
  }
}

type CatalogStore = CatalogSnapshot & {
  hydrated: boolean;
  hydrate: () => void;
  setSearchEngine: (id: SearchEngineId) => void;
  setBraveApiKey: (value: string) => void;
  setGoogleApiKey: (value: string) => void;
  setGoogleCx: (value: string) => void;
  setSearchCountry: (value: string) => void;
  setRetailerEnabled: (id: string, enabled: boolean) => void;
  addRetailer: (name: string, domainsRaw: string) => { ok: true } | { ok: false; error: string };
  removeRetailer: (id: string) => void;
  enabledRetailers: () => CatalogRetailer[];
  allRetailers: () => CatalogRetailer[];
  searchPayload: () => SearchPayload;
};

export type SearchPayload = {
  engine: SearchEngineId;
  country: string;
  braveApiKey: string;
  googleApiKey: string;
  googleCx: string;
  retailers: { id: string; name: string; domains: string[] }[];
};

function persist(partial: Partial<CatalogSnapshot>, get: () => CatalogStore): CatalogSnapshot {
  const current = get();
  const next: CatalogSnapshot = {
    retailers: partial.retailers ?? current.retailers,
    searchEngine: partial.searchEngine ?? current.searchEngine,
    braveApiKey: partial.braveApiKey ?? current.braveApiKey,
    googleApiKey: partial.googleApiKey ?? current.googleApiKey,
    googleCx: partial.googleCx ?? current.googleCx,
    searchCountry: partial.searchCountry ?? current.searchCountry,
  };
  writeCatalog(next);
  return next;
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  ...defaultCatalog(),
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ ...readCatalog(), hydrated: true });
  },
  setSearchEngine: (searchEngine) => {
    set(persist({ searchEngine }, get));
    void useSettingsStore
      .getState()
      .save({ searchEngine })
      .catch(() => {
        /* offline / preview */
      });
  },
  setSearchCountry: (searchCountry) => {
    const next = searchCountry.toUpperCase().slice(0, 2);
    set(persist({ searchCountry: next }, get));
    void useSettingsStore
      .getState()
      .save({ searchCountry: next })
      .catch(() => {
        /* offline / preview */
      });
  },
  setBraveApiKey: (braveApiKey) => set(persist({ braveApiKey }, get)),
  setGoogleApiKey: (googleApiKey) => set(persist({ googleApiKey }, get)),
  setGoogleCx: (googleCx) => set(persist({ googleCx }, get)),
  setRetailerEnabled: (id, enabled) => {
    const retailers = get().retailers.map((retailer) =>
      retailer.id === id ? { ...retailer, enabled } : retailer,
    );
    set(persist({ retailers }, get));
  },
  addRetailer: (name, domainsRaw) => {
    const trimmed = name.trim();
    const domains = parseDomains(domainsRaw);
    if (!trimmed) return { ok: false, error: "Give the shop a name." };
    if (domains.length === 0) return { ok: false, error: "Add at least one domain, e.g. zalando.de" };
    const existing = get().retailers;
    const clash = existing.find((retailer) =>
      retailer.domains.some((domain) => domains.includes(domain)),
    );
    if (clash) return { ok: false, error: `${clash.name} already covers that domain.` };
    let id = slugify(trimmed);
    if (existing.some((retailer) => retailer.id === id)) id = `${id}${Date.now().toString(36).slice(-3)}`;
    const retailers: CatalogRetailer[] = [
      ...existing,
      { id, name: trimmed, domains, enabled: true, custom: true },
    ];
    set(persist({ retailers }, get));
    return { ok: true };
  },
  removeRetailer: (id) => {
    const retailers = get().retailers.filter((retailer) => !(retailer.custom && retailer.id === id));
    set(persist({ retailers }, get));
  },
  enabledRetailers: () => get().retailers.filter((retailer) => retailer.enabled),
  allRetailers: () => get().retailers,
  searchPayload: () => {
    const state = get();
    const studio = useSettingsStore.getState();
    return {
      engine: studio.hydrated ? studio.searchEngine : state.searchEngine,
      country: (studio.hydrated ? studio.searchCountry : state.searchCountry) || "DE",
      braveApiKey: state.braveApiKey.trim(),
      googleApiKey: state.googleApiKey.trim(),
      googleCx: state.googleCx.trim(),
      retailers: state.retailers
        .filter((retailer) => retailer.enabled)
        .map(({ id, name, domains }) => ({ id, name, domains })),
    };
  },
}));
