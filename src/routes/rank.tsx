import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { listRankedCreators } from "@/lib/looks/api";
import {
  rankLooks,
  type CreatorRank,
} from "@/lib/looks/rank";
import { useLooksStore } from "@/lib/looks/store";
import { rankWeights } from "@/lib/settings/model";
import { useSettingsStore } from "@/lib/settings/store";

export const Route = createFileRoute("/rank")({ component: RankPage });

function RankPage() {
  const looks = useLooksStore((s) => s.looks);
  const scoreLook = useSettingsStore((s) => s.scoreLook);
  const scorePin = useSettingsStore((s) => s.scorePin);
  const scoreCompared = useSettingsStore((s) => s.scoreCompared);
  const weights = rankWeights({ scoreLook, scorePin, scoreCompared });
  const rankedLooks = useMemo(() => rankLooks(looks, weights), [looks, weights]);
  const [creators, setCreators] = useState<CreatorRank[]>([]);

  useEffect(() => {
    let alive = true;
    void listRankedCreators()
      .then((rows) => {
        if (alive) setCreators(rows);
      })
      .catch(() => {
        if (alive) setCreators([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell title="Rank" largeTitle>
      <ScreenTitle kicker="Board">Rank</ScreenTitle>
      <p className="mb-6 text-sm text-muted-foreground">
        Looks first — {scoreLook} to start, {scorePin} per pin,{" "}
        {scoreCompared} when a piece has two live prices. Publish to join
        the creator board.
      </p>

      <div className="rank-layout">
        {rankedLooks.length === 0 ? (
          <div className="rounded-xl bg-card p-6 shadow-[var(--shadow-border)]">
            <p className="ds-section-title">No looks yet</p>
            <p className="mt-2 text-sm text-muted-foreground">Browse the feed, then come back.</p>
          </div>
        ) : (
          <ol className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
            {rankedLooks.map((row, index) => (
              <li key={row.look.id} className="border-b border-border last:border-b-0">
                <Link
                  to="/looks/$lookId"
                  params={{ lookId: row.look.id }}
                  className="flex min-h-16 items-center gap-3 px-3 py-2.5"
                >
                  <span className="w-7 shrink-0 font-display text-xl tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {row.look.imageSrc ? (
                    <img
                      src={row.look.imageSrc}
                      alt=""
                      className="size-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="size-12 shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="ds-card-title">{row.look.title}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {row.look.creator} · {row.pins} pins · {row.compared} compared
                    </p>
                  </div>
                  <p className="w-10 shrink-0 text-right font-display text-2xl tabular-nums">
                    {row.score}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {creators.length > 0 ? (
          <section>
            <h2 className="ds-section-title mb-3">Creators</h2>
            <ol className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
              {creators.map((creator, index) => (
                <li key={creator.userId} className="border-b border-border last:border-b-0">
                  <Link
                    to="/creators/$userId"
                    params={{ userId: creator.userId }}
                    className="flex min-h-16 items-center gap-3 px-4 py-3"
                  >
                    <span className="w-7 shrink-0 font-display text-xl tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="ds-card-title">{creator.displayName}</p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        @{creator.handle} · {creator.looks} looks · {creator.pins} pins
                      </p>
                    </div>
                    <p className="w-10 shrink-0 text-right font-display text-2xl tabular-nums">
                      {creator.score}
                    </p>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in from You, publish a look, and you appear as a creator.
          </p>
        )}
      </div>
    </AppShell>
  );
}
