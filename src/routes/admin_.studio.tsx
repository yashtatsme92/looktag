import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/admin-gate";
import { BrowseBar, BrowsePager, useScrollPicked } from "@/components/admin/browse-bar";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { AdminNav } from "@/components/observability/admin-nav";
import { BootArtwork } from "@/components/layout/boot-splash";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { replayBootSplash } from "@/lib/pwa/boot";
import { SPLASH_OPTIONS, parseSplashId, writeStoredSplash } from "@/lib/pwa/splash";
import {
  browseHouses,
  houseNote,
  suggestHouses,
  STUDIO_HOUSE_FILTERS,
  STUDIO_HOUSE_SORTS,
  type HouseBrowseItem,
  type HouseFilter,
  type HouseSort,
} from "@/lib/admin/browse";
import { listFashionCollections, listRankedLabels, setLabelScouted } from "@/lib/labels/api";
import { SCOUTED_FLAG, type FashionCollection, type RankedLabel } from "@/lib/labels/model";
import { SEARCH_ENGINES } from "@/lib/looks/catalog";
import { SEARCH_REGIONS, resolveRegion } from "@/lib/looks/region";
import { useLooksStore } from "@/lib/looks/store";
import {
  hasSignupMethod,
  type AppSettings,
  type SearchEngineId,
} from "@/lib/settings/model";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin_/studio")({ component: StudioAdminPage });

function StudioAdminPage() {
  return (
    <AdminGate>
      <StudioAdmin />
    </AdminGate>
  );
}

function StudioAdmin() {
  const settings = useSettingsStore();
  const refreshLooks = useLooksStore((s) => s.refresh);
  const [houses, setHouses] = useState<HouseBrowseItem[]>([]);
  const [collections, setCollections] = useState<FashionCollection[]>([]);
  const [country, setCountry] = useState(settings.searchCountry);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HouseSort>("awesome");
  const [filter, setFilter] = useState<HouseFilter>("all");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    settings.hydrate();
  }, [settings.hydrate]);

  useEffect(() => {
    setCountry(settings.searchCountry);
  }, [settings.searchCountry]);

  useEffect(() => {
    let alive = true;
    void Promise.all([listRankedLabels(), listFashionCollections()])
      .then(([rows, nextCollections]) => {
        if (alive) {
          setHouses(rows.map(toHouseBrowse));
          setCollections(nextCollections);
        }
      })
      .catch(() => {
        if (!alive) return;
        setHouses([]);
        setCollections([]);
      });
    return () => {
      alive = false;
    };
  }, [settings.labelsEnabled]);

  async function patch(next: Partial<AppSettings>) {
    const merged = { ...settings, ...next };
    if (!hasSignupMethod(merged)) {
      toast.error("Leave at least one sign-up method on.");
      return;
    }
    try {
      const saved = await settings.save(next);
      if (typeof next.labelsEnabled === "boolean") {
        refreshLooks();
        if (next.labelsEnabled) {
          const [rows, nextCollections] = await Promise.all([
            listRankedLabels(),
            listFashionCollections(),
          ]);
          setHouses(rows.map(toHouseBrowse));
          setCollections(nextCollections);
        } else {
          setHouses([]);
          setCollections([]);
        }
      }
      toast.success("Studio updated");
      return saved;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  }

  const list = useMemo(
    () => browseHouses(houses, query, sort, page, filter),
    [houses, query, sort, page, filter],
  );
  const suggested = useMemo(() => suggestHouses(houses, query), [houses, query]);
  useScrollPicked(picked, list.page);

  return (
    <AppShell title="Studio" backTo="/admin">
      <div data-hydrated={settings.hydrated ? "true" : "false"}>
      <ScreenTitle kicker="Studio">Sign-up & Houses</ScreenTitle>
      <AdminNav current="studio" />
      <p className="mb-6 text-sm text-muted-foreground">
        These switches live in the database. Sign-up methods hide on You. Search
        and rank scores apply everywhere. Houses is the new-labels section,
        including the {SCOUTED_FLAG} mark — search, sort, and page that list as
        it grows.
      </p>

      <section className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <h2 className="ds-card-title">Sign up</h2>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          Choose which ways people can create an account. Google and X still
          work if someone finishes a window that was already open.
        </p>
        <ul className="flex flex-col">
          <MethodRow
            label="Email"
            hint="Always works in this app. Name, email, password."
            checked={settings.signupEmail}
            onChange={(checked) => void patch({ signupEmail: checked })}
          />
          <MethodRow
            label="Google"
            hint="Opens a sign-in window."
            checked={settings.signupGoogle}
            onChange={(checked) => void patch({ signupGoogle: checked })}
          />
          <MethodRow
            label="X"
            hint="Opens a sign-in window."
            checked={settings.signupX}
            onChange={(checked) => void patch({ signupX: checked })}
          />
        </ul>
      </section>

      <section className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="ds-card-title">Splash</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Opening screen. Minimal through Atelier. Play it once to preview.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              writeStoredSplash(parseSplashId(settings.splashId));
              replayBootSplash();
            }}
          >
            Play
          </Button>
        </div>
        <RadioGroup
          value={parseSplashId(settings.splashId)}
          onValueChange={(value) => {
            const id = parseSplashId(value);
            writeStoredSplash(id);
            void patch({ splashId: id });
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {SPLASH_OPTIONS.map((option) => {
            const on = parseSplashId(settings.splashId) === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border border-border p-3 [&:has([data-state=checked])]:border-foreground",
                  on && "border-foreground",
                )}
              >
                <RadioGroupItem value={option.id} className="mt-1" aria-label={option.label} />
                <span className="min-w-0 flex-1">
                  <span className="splash-card mb-2" data-splash={option.id}>
                    <BootArtwork variant={option.id} preview />
                    <span className="splash-card-word">Looktag</span>
                  </span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </section>

      <section className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="ds-card-title">Houses</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              New fashion labels, collections, liking-based discovery, house
              rank, and the {SCOUTED_FLAG} flag.
            </p>
          </div>
          <Switch
            checked={settings.labelsEnabled}
            onCheckedChange={(checked) => void patch({ labelsEnabled: checked })}
            aria-label="Show Houses"
          />
        </div>
        {settings.labelsEnabled ? (
          <div className="border-t border-border pt-4">
            <BrowseBar
              id="studio-houses"
              query={query}
              onQuery={(value) => {
                setQuery(value);
                setPicked(null);
                setPage(1);
              }}
              placeholder="Name, city, handle"
              sort={sort}
              onSort={(id) => {
                setSort(id as HouseSort);
                setPage(1);
              }}
              sorts={STUDIO_HOUSE_SORTS}
              filter={filter}
              onFilter={(id) => {
                setFilter(id as HouseFilter);
                setPage(1);
              }}
              filters={STUDIO_HOUSE_FILTERS}
              suggestions={suggested.map((house) => ({
                id: house.id,
                title: house.name,
                note: houseNote(house),
              }))}
              onPick={(id) => {
                const house = houses.find((item) => item.id === id);
                if (house) {
                  setQuery(house.name);
                  setFilter("all");
                  setPage(1);
                  setPicked(id);
                }
              }}
              total={list.total}
              noun="houses"
            />
            {list.total === 0 ? (
              <p className="text-sm text-muted-foreground">No houses match.</p>
            ) : (
              <>
                <ul className="flex flex-col">
                  {list.items.map((house) => (
                    <li
                      key={house.id}
                      data-picked={picked === house.id ? "true" : undefined}
                      className={cn(
                        "-mx-2 flex items-center gap-3 rounded-lg border-b border-border px-2 py-3 last:border-b-0 last:pb-0",
                        picked === house.id && "bg-muted last:pb-3",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="ds-card-title">{house.name}</p>
                        <p className="text-xs leading-snug text-muted-foreground">
                          {house.city} · @{house.handle}
                        </p>
                        {collections.filter((item) => item.labelId === house.id).length > 0 ? (
                          <p className="mt-1 text-xs leading-snug text-muted-foreground">
                            {collections
                              .filter((item) => item.labelId === house.id)
                              .map((item) => item.name)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {house.score > 0 ? house.score : ""}
                      </p>
                      <Switch
                        checked={house.scouted}
                        onCheckedChange={(checked) => {
                          void setLabelScouted({ data: { id: house.id, scouted: checked } })
                            .then((saved) => {
                              if (!saved) return;
                              setHouses((current) =>
                                current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
                              );
                            })
                            .catch(() => toast.error("Could not update Scouted."));
                        }}
                        aria-label={`${house.scouted ? "Remove" : "Mark"} ${SCOUTED_FLAG} on ${house.name}`}
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
                  noun="houses"
                />
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Turn Houses on to show the tab, suggestions, rank, and {SCOUTED_FLAG}.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <h2 className="ds-card-title">Search</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Stored in the database. Shop keys stay on this device in Catalog.
        </p>
        <RadioGroup
          value={settings.searchEngine}
          onValueChange={(value) => void patch({ searchEngine: value as SearchEngineId })}
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
        <div className="mt-5 flex flex-col gap-1.5">
          <Label htmlFor="search-country">Shop region</Label>
          <select
            id="search-country"
            value={resolveRegion(country).id}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => {
              const next = event.target.value.toUpperCase();
              setCountry(next);
              if (next !== settings.searchCountry) {
                void patch({ searchCountry: next });
              }
            }}
          >
            {SEARCH_REGIONS.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name} · {region.id} · {region.currency}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            New pins open the {resolveRegion(country).name} storefront — Zalando.{resolveRegion(country).id === "GB" ? "co.uk" : resolveRegion(country).id.toLowerCase()}, Zara /{resolveRegion(country).id.toLowerCase()}/, COS /en-{resolveRegion(country).id.toLowerCase()}/.
          </p>
        </div>
      </section>

      <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <h2 className="ds-card-title">Rank</h2>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          Points for looks, pins, and compared prices. Applies to creators and houses.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <ScoreField
            id="score-look"
            label="Look"
            value={settings.scoreLook}
            onChange={(value) => void patch({ scoreLook: value })}
          />
          <ScoreField
            id="score-pin"
            label="Pin"
            value={settings.scorePin}
            onChange={(value) => void patch({ scorePin: value })}
          />
          <ScoreField
            id="score-compared"
            label="Compared"
            value={settings.scoreCompared}
            onChange={(value) => void patch({ scoreCompared: value })}
          />
        </div>
      </section>
      </div>
    </AppShell>
  );
}

function ScoreField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(String(value));
  }, [value]);

  function commit() {
    focused.current = false;
    const n = Number(local);
    if (!Number.isFinite(n)) {
      setLocal(String(value));
      return;
    }
    const next = Math.max(0, Math.min(40, Math.round(n)));
    setLocal(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="break-words leading-snug">{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={40}
        value={local}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setLocal(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </div>
  );
}

function MethodRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={`${checked ? "Hide" : "Show"} ${label} sign-up`} />
    </li>
  );
}

function toHouseBrowse(row: RankedLabel): HouseBrowseItem {
  return {
    id: row.label.id,
    name: row.label.name,
    handle: row.label.handle,
    bio: row.label.bio,
    city: row.label.city,
    moods: row.label.moods,
    scouted: row.label.scouted,
    status: row.label.status,
    createdAt: row.label.createdAt,
    looks: row.looks,
    pins: row.pins,
    score: row.score,
  };
}
