import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/admin-gate";
import { BrowseBar, BrowsePager, useScrollPicked } from "@/components/admin/browse-bar";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { AdminNav } from "@/components/observability/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  browseShops,
  shopNote,
  shopPinCounts,
  SHOP_FILTERS,
  SHOP_SORTS,
  suggestShops,
  type ShopFilter,
  type ShopSort,
} from "@/lib/admin/browse";
import {
  SEARCH_ENGINES,
  useCatalogStore,
  type SearchEngineId,
} from "@/lib/looks/catalog";
import { useLooksStore } from "@/lib/looks/store";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin_/shops")({ component: AdminShopsPage });

function AdminShopsPage() {
  return (
    <AdminGate>
      <ShopsAdmin />
    </AdminGate>
  );
}

function ShopsAdmin() {
  const retailers = useCatalogStore((s) => s.retailers);
  const localEngine = useCatalogStore((s) => s.searchEngine);
  const studioEngine = useSettingsStore((s) => s.searchEngine);
  const studioHydrated = useSettingsStore((s) => s.hydrated);
  const searchEngine = studioHydrated ? studioEngine : localEngine;
  const braveApiKey = useCatalogStore((s) => s.braveApiKey);
  const googleApiKey = useCatalogStore((s) => s.googleApiKey);
  const googleCx = useCatalogStore((s) => s.googleCx);
  const setSearchEngine = useCatalogStore((s) => s.setSearchEngine);
  const setBraveApiKey = useCatalogStore((s) => s.setBraveApiKey);
  const setGoogleApiKey = useCatalogStore((s) => s.setGoogleApiKey);
  const setGoogleCx = useCatalogStore((s) => s.setGoogleCx);
  const setRetailerEnabled = useCatalogStore((s) => s.setRetailerEnabled);
  const addRetailer = useCatalogStore((s) => s.addRetailer);
  const removeRetailer = useCatalogStore((s) => s.removeRetailer);
  const looks = useLooksStore((s) => s.looks);
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ShopSort>("awesome");
  const [filter, setFilter] = useState<ShopFilter>("all");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);

  const shops = useMemo(() => {
    const pins = shopPinCounts(looks);
    return retailers.map((retailer) => ({
      ...retailer,
      pins: pins.get(retailer.id) ?? 0,
    }));
  }, [retailers, looks]);

  const list = browseShops(shops, query, sort, page, filter);
  const suggested = suggestShops(shops, query);
  const enabledCount = retailers.filter((retailer) => retailer.enabled).length;
  useScrollPicked(picked, list.page);

  function resetPage() {
    setPage(1);
  }

  function handleAdd() {
    const result = addRetailer(name, domains);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setName("");
    setDomains("");
    toast.success("Shop added");
  }

  function pickShop(id: string) {
    const shop = shops.find((item) => item.id === id);
    if (!shop) return;
    setQuery(shop.name);
    setFilter("all");
    setPage(1);
    setPicked(id);
  }

  return (
    <AppShell title="Shops" backTo="/admin">
      <ScreenTitle kicker="Catalog">Shops & search</ScreenTitle>
      <AdminNav current="shops" />
      <p className="mb-6 text-sm text-muted-foreground">
        Search, sort, and page as the catalog grows. Suggested ranks shops by pins on looks, then
        by how often they should lead search. Hide a retailer and it drops out of new pins.
      </p>

      <section className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">Shops</h2>
          <p className="text-xs tabular-nums text-muted-foreground">{enabledCount} on</p>
        </div>
        <BrowseBar
          id="shops"
          query={query}
          onQuery={(value) => {
            setQuery(value);
            setPicked(null);
            resetPage();
          }}
          placeholder="Name or domain"
          sort={sort}
          onSort={(id) => {
            setSort(id as ShopSort);
            resetPage();
          }}
          sorts={SHOP_SORTS}
          filter={filter}
          onFilter={(id) => {
            setFilter(id as ShopFilter);
            resetPage();
          }}
          filters={SHOP_FILTERS}
          suggestions={suggested.map((shop) => ({
            id: shop.id,
            title: shop.name,
            note: shopNote(shop),
          }))}
          onPick={pickShop}
          total={list.total}
          noun="shops"
        />
        {list.total === 0 ? (
          <p className="text-sm text-muted-foreground">No shops match.</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {list.items.map((retailer) => (
                <li
                  key={retailer.id}
                  data-picked={picked === retailer.id ? "true" : undefined}
                  className={cn(
                    "-mx-2 flex items-center gap-3 rounded-lg border-b border-border px-2 py-3 first:pt-0 last:border-b-0 last:pb-0",
                    picked === retailer.id && "bg-muted first:pt-3 last:pb-3",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{retailer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{retailer.domains.join(" · ")}</p>
                  </div>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {retailer.pins > 0
                      ? `${retailer.pins} ${retailer.pins === 1 ? "pin" : "pins"}`
                      : retailer.enabled
                        ? ""
                        : "Off"}
                  </p>
                  {retailer.custom ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeRetailer(retailer.id)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Remove {retailer.name}</span>
                    </Button>
                  ) : null}
                  <Switch
                    checked={retailer.enabled}
                    onCheckedChange={(checked) => setRetailerEnabled(retailer.id, checked)}
                    aria-label={`${retailer.enabled ? "Hide" : "Show"} ${retailer.name}`}
                  />
                </li>
              ))}
            </ul>
            <BrowsePager
              page={list.page}
              pages={list.pages}
              from={list.from}
              to={list.to}
              total={list.total}
              onPage={setPage}
              noun="shops"
            />
          </>
        )}

        <Separator className="my-5" />

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Add a shop
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shop-name">Name</Label>
              <Input
                id="shop-name"
                value={name}
                placeholder="Weekday"
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shop-domains">Domains</Label>
              <Input
                id="shop-domains"
                value={domains}
                placeholder="weekday.com, weekday.de"
                autoComplete="off"
                onChange={(event) => setDomains(event.target.value)}
              />
            </div>
          </div>
          <Button type="button" variant="outline" onClick={handleAdd}>
            <Plus className="size-4" />
            Add shop
          </Button>
        </div>
      </section>

      <aside className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <h2 className="font-display text-2xl">Search engine</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Used when you tap Search item. Only shops that are on are searched.
        </p>
        <RadioGroup
          value={searchEngine}
          onValueChange={(value) => setSearchEngine(value as SearchEngineId)}
          className="mt-5 flex flex-col gap-3"
        >
          {SEARCH_ENGINES.map((engine) => (
            <label
              key={engine.id}
              className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 [&:has([data-state=checked])]:border-foreground"
            >
              <RadioGroupItem value={engine.id} className="mt-1" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{engine.name}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {engine.hint}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>

        {searchEngine === "brave" ? (
          <div className="mt-5 flex flex-col gap-1.5">
            <Label htmlFor="brave-key">Brave API key</Label>
            <Input
              id="brave-key"
              type="password"
              value={braveApiKey}
              autoComplete="off"
              placeholder="BSA..."
              onChange={(event) => setBraveApiKey(event.target.value)}
            />
          </div>
        ) : null}

        {searchEngine === "google" ? (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="google-key">Google API key</Label>
              <Input
                id="google-key"
                type="password"
                value={googleApiKey}
                autoComplete="off"
                onChange={(event) => setGoogleApiKey(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="google-cx">Search engine ID (cx)</Label>
              <Input
                id="google-cx"
                value={googleCx}
                autoComplete="off"
                onChange={(event) => setGoogleCx(event.target.value)}
              />
            </div>
          </div>
        ) : null}
      </aside>
    </AppShell>
  );
}
