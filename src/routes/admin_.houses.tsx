import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/admin-gate";
import { BrowseBar, BrowsePager, useScrollPicked } from "@/components/admin/browse-bar";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Button } from "@/components/ui/button";
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
import { SCOUTED_FLAG, houseQueueActions, queueStatusLabel, type HouseStatus } from "@/lib/labels/model";
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
      toast.success(
        status === "approved"
          ? "House is live"
          : status === "rejected"
            ? "House declined"
            : status === "disabled"
              ? "House disabled"
              : "Moved to waiting",
      );
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
      <div className="ops-stage">
      <ScreenTitle kicker="Admin">Houses</ScreenTitle>

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
      </div>
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
    <li data-picked={picked ? "true" : undefined} className={cn("ops-card", picked && "ops-card-picked")}>
      <span className="ops-chip">{queueStatusLabel(house.status)}</span>
      <p className="ops-card-name">{house.name}</p>
      <p className="ops-row-note">
        {house.city || "City not set"}
        {house.handle ? ` · @${house.handle}` : ""}
      </p>
      <div
        className="ops-actions"
        style={{ gridTemplateColumns: `repeat(${Math.max(houseQueueActions(house.status).length, 1)}, minmax(0, 1fr))` }}
      >
        {houseQueueActions(house.status).map((action) => (
          <Button
            key={action.id}
            type="button"
            variant="outline"
            className="ops-action"
            data-on={action.id === "scouted" && house.scouted ? "true" : "false"}
            onClick={() => {
              if (action.id === "scouted") {
                void setLabelScouted({ data: { id: house.id, scouted: !house.scouted } })
                  .then((saved) => {
                    if (saved) onScouted({ ...house, ...saved });
                  })
                  .catch(() => toast.error("Could not update Scouted."));
                return;
              }
              if (action.status) onStatus(house.id, action.status);
            }}
          >
            {action.id === "scouted" ? SCOUTED_FLAG : action.label}
          </Button>
        ))}
      </div>
    </li>
  );
}
