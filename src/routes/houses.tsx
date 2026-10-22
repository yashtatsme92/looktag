import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HouseCard } from "@/components/labels/house-card";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { AppShell } from "@/components/layout/app-shell";
import { FadeLayer } from "@/components/ds/fade-layer";
import { SkeletonGrid } from "@/components/ds/skeleton";
import { pickWeeklyDrop, splitScoutedHouses, type WeeklyDrop } from "@/lib/home/engagement";
import { getHousesAvailability, listFashionCollections, listFashionLabels, listFashionStyles } from "@/lib/labels/api";
import { consumerHouseIndex, houseCoverSrc, publicLines, type FashionLabel } from "@/lib/labels/model";
import { clientDeferred, useRouteLoad } from "@/lib/loading/route-load";
import { useSettingsStore } from "@/lib/settings/store";

type HousesIndex = {
  open: boolean;
  labels: FashionLabel[];
  covers: Record<string, string>;
  drop: WeeklyDrop | null;
};

async function loadHousesIndex(): Promise<HousesIndex> {
  try {
    const open = await getHousesAvailability();
    if (!open) return { open: false, labels: [], covers: {}, drop: null };
    const [labels, collections, styles] = await Promise.all([
      listFashionLabels(),
      listFashionCollections(),
      listFashionStyles(),
    ]);
    const covers: Record<string, string> = {};
    for (const label of labels) {
      const lines = publicLines(
        collections.filter((collection) => collection.labelId === label.id),
        styles.filter((style) => style.labelId === label.id),
      );
      covers[label.id] = houseCoverSrc(lines, label.coverSrc);
    }
    return { open: true, labels, covers, drop: pickWeeklyDrop(labels, collections, styles) };
  } catch {
    return { open: true, labels: [], covers: {}, drop: null };
  }
}

export const Route = createFileRoute("/houses")({
  ssr: true,
  loader: () => clientDeferred(loadHousesIndex, "houses:index"),
  head: () => ({
    meta: [
      { title: "Houses — Looktag" },
      {
        name: "description",
        content: "Scouted fashion houses, then the rest. Picked by Looktag.",
      },
    ],
  }),
  component: HousesPage,
});

function HousesPage() {
  const seeded = Route.useLoaderData();
  const housesLoad = useRouteLoad(seeded, "houses:index", loadHousesIndex);
  const data = housesLoad.data;
  const closed = useHousesClosed(data ? data.open : true);
  const [refetched, setRefetched] = useState<FashionLabel[] | null>(null);
  const labels = useMemo(() => refetched ?? data?.labels ?? [], [data?.labels, refetched]);
  const covers = data?.covers ?? {};
  const feedDropOn = useSettingsStore((s) => s.feedDrop);
  const drop = !closed && feedDropOn ? (data?.drop ?? null) : null;

  useEffect(() => {
    if (closed || !data?.open) return;
    let alive = true;
    void listFashionLabels()
      .then((next) => {
        if (alive) setRefetched(next);
      })
      .catch(() => {
        if (alive) setRefetched([]);
      });
    return () => {
      alive = false;
    };
  }, [closed, data?.open]);

  const index = useMemo(() => consumerHouseIndex(labels), [labels]);

  if (closed) return <HousesClosed />;

  function grid(items: FashionLabel[]) {
    return (
      <div className="house-index-grid">
        {items.map((label) => (
          <HouseCard key={label.id} label={label} coverSrc={label.coverSrc || covers[label.id]} />
        ))}
      </div>
    );
  }

  const weeklyDrop = drop ? (
    <section className="house-drop" aria-label="This week's drop">
      <Link
        to="/houses/$labelId/$collectionId"
        params={{ labelId: drop.houseId, collectionId: drop.lineSlug }}
      >
        <img src={drop.imageSrc} alt="" />
      </Link>
      <div>
        <p className="house-drop-kicker">This week's drop</p>
        <h2 className="house-drop-title">{drop.lineName}</h2>
        <p className="house-drop-house">{drop.houseName}</p>
        <Link
          to="/houses/$labelId/$collectionId"
          params={{ labelId: drop.houseId, collectionId: drop.lineSlug }}
          className="house-ghost"
        >
          View Line
        </Link>
      </div>
    </section>
  ) : null;
  const empty = index.scouted.length === 0 && index.more.length === 0;
  const scoutedDropLayouts = [2, 3, 4].map((columns) => {
    const { firstRow, remaining } = splitScoutedHouses(index.scouted, columns);
    return (
      <div key={columns} className={`houses-scouted-layout houses-scouted-layout--${columns}`}>
        {grid(firstRow)}
        {weeklyDrop}
        {remaining.length > 0 ? grid(remaining) : null}
      </div>
    );
  });

  return (
    <AppShell
      title="Houses"
      largeTitle={false}
      trailing={
        <Link to="/house" className="houses-for">
          For houses
        </Link>
      }
    >
      <div className="houses-wide-hd">
        <p className="houses-wide-title">Houses</p>
        <Link to="/house" className="houses-for">
          For houses
        </Link>
      </div>
      <FadeLayer stateKey={housesLoad.skeleton ? "skeleton" : housesLoad.waiting ? "waiting" : "ready"}>
      {housesLoad.error ? (
        <p className="text-sm text-muted-foreground">Houses aren't available right now</p>
      ) : housesLoad.skeleton ? (
        <SkeletonGrid count={8} captions />
      ) : housesLoad.waiting ? (
        <div className="is-loading-old" aria-hidden />
      ) : index.scouted.length === 0 ? weeklyDrop : null}
      {housesLoad.error || housesLoad.skeleton || housesLoad.waiting ? null : empty ? (
        <p className="text-sm text-muted-foreground">No houses yet.</p>
      ) : (
        <>
          {index.scouted.length > 0 ? (
            <section className="mb-8" aria-labelledby="houses-scouted">
              <div className="mb-1 flex items-center gap-2">
                <h1 id="houses-scouted" className="ds-section-title">
                  Scouted
                </h1>
                <span className="houses-scouted-dot" aria-hidden />
              </div>
              <p className="houses-scouted-note">Picked by Looktag — clothes and covers first.</p>
              {drop ? scoutedDropLayouts : null}
              {!drop ? grid(index.scouted) : null}
            </section>
          ) : null}
          {index.more.length > 0 ? (
            <section className="mb-8">
              <h2 className="ds-section-title mb-3">More houses</h2>
              {grid(index.more)}
            </section>
          ) : null}
        </>
      )}
      </FadeLayer>
    </AppShell>
  );
}