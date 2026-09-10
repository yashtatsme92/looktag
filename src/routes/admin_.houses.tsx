import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/admin-gate";
import { BrowseBar, BrowsePager, useScrollPicked } from "@/components/admin/browse-bar";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AdminNav } from "@/components/observability/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  browseHouses,
  HOUSE_FILTERS,
  HOUSE_SORTS,
  houseMatches,
  houseNote,
  paginate,
  sortHouses,
  suggestHouses,
  type HouseFilter,
  type HouseSort,
} from "@/lib/admin/browse";
import { listAdminHouses, setHouseStatus, setLabelScouted, type AdminHouse } from "@/lib/labels/api";
import { SCOUTED_FLAG, type HouseStatus } from "@/lib/labels/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin_/houses")({ component: AdminHousesPage });

function AdminHousesPage() {
  return (
    <AdminGate>
      <HousesAdmin />
    </AdminGate>
  );
}

function HousesAdmin() {
  const [houses, setHouses] = useState<AdminHouse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<HouseSort>("awesome");
  const [filter, setFilter] = useState<HouseFilter>("all");
  const [page, setPage] = useState(1);
  const [waitingPage, setWaitingPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void listAdminHouses()
      .then((rows) => {
        if (!alive) return;
        setHouses(rows);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setHouses([]);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
    setWaitingPage(1);
  }, [query, sort, filter]);

  function patchHouse(saved: AdminHouse | null) {
    if (!saved) return;
    setHouses((current) => current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)));
  }

  async function patchStatus(id: string, status: HouseStatus) {
    try {
      const saved = await setHouseStatus({ data: { id, status } });
      if (!saved) return;
      setHouses((current) =>
        current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
      );
      toast.success(status === "approved" ? "House is live" : status === "rejected" ? "House declined" : "Moved to pending");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update house.");
    }
  }

  function pickHouse(id: string) {
    const house = houses.find((item) => item.id === id);
    if (!house) return;
    setQuery(house.name);
    setFilter("all");
    setPage(1);
    setPicked(id);
  }

  const pending = useMemo(
    () => houses.filter((house) => house.status === "pending" && houseMatches(house, query)),
    [houses, query],
  );
  const waiting = paginate(sortHouses(pending, "newest"), waitingPage);
  const all = browseHouses(houses, query, sort, page, filter);
  const suggested = suggestHouses(houses, query);
  useScrollPicked(picked, all.page);


  return (
    <AppShell title="Houses" backTo="/admin">
      <ScreenTitle kicker="Admin">House applications</ScreenTitle>
      <AdminNav current="houses" />
      <p className="mb-6 text-sm text-muted-foreground">
        Search, filter, and page as houses grow. Suggested ranks Scouted and high-score labels first.
        {` ${SCOUTED_FLAG}`} is for houses Looktag picks.
      </p>

      <section className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]" data-loaded={loaded ? "true" : "false"}>
        <BrowseBar
          id="houses"
          query={query}
          onQuery={(value) => {
            setQuery(value);
            setPicked(null);
          }}
          placeholder="Name, city, handle"
          sort={sort}
          onSort={(id) => setSort(id as HouseSort)}
          sorts={HOUSE_SORTS}
          filter={filter}
          onFilter={(id) => setFilter(id as HouseFilter)}
          filters={HOUSE_FILTERS}
          suggestions={suggested.map((house) => ({
            id: house.id,
            title: house.name,
            note: houseNote(house),
          }))}
          onPick={pickHouse}
          total={all.total}
          noun="houses"
        />
      </section>

      <section className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <h2 className="ds-card-title">Waiting</h2>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          {loaded ? `${pending.length} pending` : "Loading…"}
        </p>
        {pending.length === 0 && loaded ? (
          <p className="text-sm text-muted-foreground">No applications right now.</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {waiting.items.map((house) => (
                <HouseRow
                  key={house.id}
                  house={house}
                  picked={picked === house.id}
                  onStatus={patchStatus}
                  onScouted={patchHouse}
                />
              ))}
            </ul>
            <BrowsePager
              page={waiting.page}
              pages={waiting.pages}
              from={waiting.from}
              to={waiting.to}
              total={waiting.total}
              onPage={setWaitingPage}
              noun="waiting"
            />
          </>
        )}
      </section>

      <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <h2 className="ds-card-title">All houses</h2>
        {all.total === 0 && loaded ? (
          <p className="mt-3 text-sm text-muted-foreground">No houses match.</p>
        ) : (
          <>
            <ul className="mt-3 flex flex-col">
              {all.items.map((house) => (
                <HouseRow
                  key={house.id}
                  house={house}
                  picked={picked === house.id}
                  onStatus={patchStatus}
                  onScouted={patchHouse}
                />
              ))}
            </ul>
            <BrowsePager
              page={all.page}
              pages={all.pages}
              from={all.from}
              to={all.to}
              total={all.total}
              onPage={setPage}
              noun="houses"
            />
          </>
        )}
      </section>
    </AppShell>
  );
}

function HouseRow({
  house,
  picked,
  onStatus,
  onScouted,
}: {
  house: AdminHouse;
  picked?: boolean;
  onStatus: (id: string, status: HouseStatus) => void;
  onScouted: (house: AdminHouse) => void;
}) {
  return (
    <li
      data-picked={picked ? "true" : undefined}
      className={cn(
        "-mx-2 flex flex-col gap-3 rounded-lg border-b border-border px-2 py-4 last:border-b-0 last:pb-0 first:pt-0",
        picked && "bg-muted first:pt-3 last:pb-3",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="ds-card-title">{house.name}</p>
            <StatusBadge status={house.status} />
            {house.scouted ? <ScoutedMark /> : null}
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {house.city || "City not set"} · @{house.handle}
          </p>
          {house.bio ? <p className="mt-2 text-sm text-muted-foreground">{house.bio}</p> : null}
        </div>
        {house.score > 0 ? (
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{house.score}</p>
        ) : null}
        {house.status === "approved" ? (
          <Switch
            checked={house.scouted}
            onCheckedChange={(checked) => {
              void setLabelScouted({ data: { id: house.id, scouted: checked } })
                .then((saved) => {
                  if (saved) onScouted({ ...house, ...saved });
                })
                .catch(() => toast.error("Could not update Scouted."));
            }}
            aria-label={`${house.scouted ? "Remove" : "Mark"} ${SCOUTED_FLAG} on ${house.name}`}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {house.status !== "approved" ? (
          <Button type="button" size="sm" onClick={() => onStatus(house.id, "approved")}>
            Approve
          </Button>
        ) : null}
        {house.status !== "rejected" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onStatus(house.id, "rejected")}>
            Decline
          </Button>
        ) : null}
        {house.status !== "pending" ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onStatus(house.id, "pending")}>
            Hold
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: HouseStatus }) {
  const label = status === "approved" ? "Live" : status === "pending" ? "Pending" : "Declined";
  return <Badge variant={status === "approved" ? "default" : "muted"}>{label}</Badge>;
}
