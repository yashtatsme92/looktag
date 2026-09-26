import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { HouseCard } from "@/components/labels/house-card";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { listFashionLabels } from "@/lib/labels/api";
import {
  SCOUTED_FLAG,
  consumerHouseIndex,
  looksBelongToHouse,
  type FashionLabel,
} from "@/lib/labels/model";
import { useLooksStore } from "@/lib/looks/store";
import { useSettingsStore } from "@/lib/settings/store";

export const Route = createFileRoute("/houses")({
  ssr: true,
  loader: async () => {
    try {
      const labels = await listFashionLabels();
      return { labels };
    } catch {
      return { labels: [] as FashionLabel[] };
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
  const labelsEnabled = useSettingsStore((s) => s.labelsEnabled);
  const looks = useLooksStore((s) => s.looks);
  const [labels, setLabels] = useState<FashionLabel[]>(seeded.labels);

  useEffect(() => {
    if (!labelsEnabled) return;
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
  }, [labelsEnabled]);

  const index = useMemo(() => consumerHouseIndex(labels), [labels]);

  if (!labelsEnabled) return <Navigate to="/" />;

  function grid(items: FashionLabel[]) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((label) => {
          const houseLooks = looks.filter((look) => looksBelongToHouse(look, label));
          return (
            <HouseCard key={label.id} label={label} cover={houseLooks[0]} looks={houseLooks} />
          );
        })}
      </div>
    );
  }

  const empty = index.scouted.length === 0 && index.more.length === 0;

  return (
    <AppShell title="Houses">
      <ScreenTitle kicker={SCOUTED_FLAG}>Houses</ScreenTitle>
      <p className="mb-6 text-sm text-muted-foreground">
        {SCOUTED_FLAG} houses are picked by Looktag. The rest follow.
      </p>
      {empty ? (
        <p className="text-sm text-muted-foreground">No houses yet.</p>
      ) : (
        <>
          {index.scouted.length > 0 ? (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="ds-section-title">Scouted</h2>
                <ScoutedMark />
              </div>
              {grid(index.scouted)}
            </section>
          ) : null}
          {index.more.length > 0 ? (
            <section className="mb-8">
              <h2 className="ds-section-title mb-3">More</h2>
              {grid(index.more)}
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
