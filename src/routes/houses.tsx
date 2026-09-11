import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { HouseCard } from "@/components/labels/house-card";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Chip } from "@/components/ds";
import { listFashionLabels, listRankedLabels } from "@/lib/labels/api";
import {
  SCOUTED_FLAG,
  labelsForLikings,
  likingsFromLooks,
  looksBelongToHouse,
  type FashionLabel,
  type RankedLabel,
} from "@/lib/labels/model";
import { MOODS, type MoodId } from "@/lib/looks/moods";
import { useSavedLooks } from "@/lib/looks/saved";
import { useLooksStore } from "@/lib/looks/store";
import { useSettingsStore } from "@/lib/settings/store";

export const Route = createFileRoute("/houses")({
  ssr: true,
  loader: async () => {
    try {
      const [labels, ranked] = await Promise.all([listFashionLabels(), listRankedLabels()]);
      return { labels, ranked };
    } catch {
      return { labels: [] as FashionLabel[], ranked: [] as RankedLabel[] };
    }
  },
  head: () => ({
    meta: [
      { title: "Houses — Looktag" },
      {
        name: "description",
        content: "Independent fashion labels grouped into named collections. Scouted houses are picked by Looktag.",
      },
    ],
  }),
  component: HousesPage,
});

function HousesPage() {
  const seeded = Route.useLoaderData();
  const labelsEnabled = useSettingsStore((s) => s.labelsEnabled);
  const looks = useLooksStore((s) => s.looks);
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const savedIds = useSavedLooks((s) => s.ids);
  const [labels, setLabels] = useState<FashionLabel[]>(seeded.labels);
  const [ranked, setRanked] = useState<RankedLabel[]>(seeded.ranked);
  const [mood, setMood] = useState<MoodId | "for-you" | null>("for-you");

  useEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  useEffect(() => {
    if (!labelsEnabled) return;
    let alive = true;
    void Promise.all([listFashionLabels(), listRankedLabels()])
      .then(([nextLabels, nextRanked]) => {
        if (!alive) return;
        setLabels(nextLabels);
        setRanked(nextRanked);
      })
      .catch(() => {
        if (!alive) return;
        setLabels([]);
        setRanked([]);
      });
    return () => {
      alive = false;
    };
  }, [labelsEnabled]);

  const savedLooks = useMemo(
    () => looks.filter((look) => savedIds.includes(look.id)),
    [looks, savedIds],
  );
  const likings = useMemo(() => likingsFromLooks(savedLooks), [savedLooks]);
  const ordered = useMemo(() => {
    if (mood === "for-you") return labelsForLikings(labels, likings);
    if (mood) {
      return labelsForLikings(
        labels.filter((label) => label.moods.includes(mood)),
        likings,
      );
    }
    return labelsForLikings(labels, []);
  }, [labels, likings, mood]);
  const scouted = useMemo(() => ordered.filter((label) => label.scouted), [ordered]);
  const more = useMemo(() => ordered.filter((label) => !label.scouted), [ordered]);

  if (!labelsEnabled) return <Navigate to="/" />;

  function renderHouseGrid(items: FashionLabel[]) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((label) => {
          const houseLooks = looks.filter((look) => looksBelongToHouse(look, label));
          const cover = houseLooks[0];
          return (
            <HouseCard key={label.id} label={label} cover={cover} looks={houseLooks} />
          );
        })}
      </div>
    );
  }

  const moreTitle =
    mood === "for-you"
      ? scouted.length > 0
        ? "More houses for you"
        : "Houses for you"
      : mood
        ? "Houses in this mood"
        : scouted.length > 0
          ? "More houses"
          : "All houses";

  return (
    <AppShell title="Houses" largeTitle>
      <ScreenTitle kicker={`${SCOUTED_FLAG} first`}>Houses</ScreenTitle>
      <p className="mb-5 text-sm text-muted-foreground">
        Independent fashion labels, grouped by collection. {SCOUTED_FLAG} houses
        are picked by Looktag — clothes before rank.
      </p>

      <p className="mb-2 text-xs tracking-[0.14em] text-muted-foreground uppercase">
        Filter houses
      </p>
      <div className="chip-scroll -mx-4 mb-6 overflow-x-auto px-4">
        <div className="flex w-max gap-2" role="group" aria-label="Filter houses by mood">
          <Chip selected={mood === "for-you"} onClick={() => setMood("for-you")}>
            For you
          </Chip>
          <Chip selected={mood === null} onClick={() => setMood(null)}>
            All
          </Chip>
          {MOODS.map((item) => (
            <Chip
              key={item.id}
              selected={mood === item.id}
              onClick={() => setMood(item.id)}
            >
              {item.label}
            </Chip>
          ))}
        </div>
      </div>

      {scouted.length > 0 ? (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="ds-section-title">Scouted houses</h2>
            <ScoutedMark />
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Picked by Looktag — start here.
          </p>
          {renderHouseGrid(scouted)}
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="ds-section-title mb-3">{moreTitle}</h2>
        {ordered.length === 0 ? (
          <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <p className="ds-section-title">No houses in this style yet</p>
            <p className="mt-2 text-sm text-muted-foreground">Try another mood, or All.</p>
          </div>
        ) : more.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every matching house is {SCOUTED_FLAG} above.
          </p>
        ) : (
          renderHouseGrid(more)
        )}
      </section>

      {ranked.length > 0 ? (
        <section>
          <h2 className="ds-section-title mb-3">House rank</h2>
          <ol className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
            {ranked.map((row, index) => (
              <li key={row.label.id} className="border-b border-border last:border-b-0">
                <Link
                  to="/houses/$labelId"
                  params={{ labelId: row.label.id }}
                  className="flex min-h-16 items-center gap-3 px-4 py-3"
                >
                  <span className="w-7 shrink-0 font-display text-xl tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="ds-card-title">{row.label.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {row.label.scouted ? <ScoutedMark /> : null}
                      <p className="text-xs leading-snug text-muted-foreground">
                        {row.label.city} · {row.collectionCount}{" "}
                        {row.collectionCount === 1 ? "collection" : "collections"} · {row.looks}{" "}
                        looks
                      </p>
                    </div>
                  </div>
                  <p className="w-10 shrink-0 text-right font-display text-2xl tabular-nums">
                    {row.score}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </AppShell>
  );
}
