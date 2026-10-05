import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HouseCard } from "@/components/labels/house-card";
import { HousesClosed, useHousesClosed } from "@/components/labels/houses-closed";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AppShell } from "@/components/layout/app-shell";
import { getHousesAvailability, listFashionCollections, listFashionLabels, listFashionStyles } from "@/lib/labels/api";
import { consumerHouseIndex, houseCoverSrc, publicLines, type FashionLabel } from "@/lib/labels/model";

export const Route = createFileRoute("/houses")({
  ssr: true,
  loader: async () => {
    try {
      const open = await getHousesAvailability();
      if (!open) return { open: false, labels: [] as FashionLabel[], covers: {} as Record<string, string> };
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
      return { open: true, labels, covers };
    } catch {
      return { open: true, labels: [] as FashionLabel[], covers: {} as Record<string, string> };
    }
  },
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
  const closed = useHousesClosed(seeded.open);
  const [labels, setLabels] = useState<FashionLabel[]>(seeded.labels);
  const covers = seeded.covers;

  useEffect(() => {
    if (closed) return;
    let alive = true;
    void listFashionLabels()
      .then((next) => {
        if (alive) setLabels(next);
      })
      .catch(() => {
        if (alive) setLabels([]);
      });
    return () => {
      alive = false;
    };
  }, [closed]);

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

  const empty = index.scouted.length === 0 && index.more.length === 0;

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
      {empty ? (
        <p className="text-sm text-muted-foreground">No houses yet.</p>
      ) : (
        <>
          {index.scouted.length > 0 ? (
            <section className="mb-8" aria-labelledby="houses-scouted">
              <div className="mb-1 flex items-center gap-2">
                <h1 id="houses-scouted" className="ds-section-title">
                  Scouted
                </h1>
                <ScoutedMark />
              </div>
              <p className="houses-scouted-note">Picked by Looktag — clothes and covers first.</p>
              {grid(index.scouted)}
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
    </AppShell>
  );
}