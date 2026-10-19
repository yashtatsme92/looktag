import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/components/admin/admin-gate";
import { AppShell } from "@/components/layout/app-shell";
import { SaveStatus } from "@/components/ds/save-status";
import { SkeletonAdminRow } from "@/components/ds/skeleton";
import { listAdminHouses, setHouseStatus, setLabelScouted, type AdminHouse } from "@/lib/labels/api";
import { houseQueueActions, queueStatusLabel, type HouseQueueAction } from "@/lib/labels/model";
import { useDelayedLoad } from "@/lib/loading/delayed-load";
import { useOptimisticSave } from "@/lib/loading/optimistic";
import { settleLoad } from "@/lib/loading/test-delay";
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
  const load = useDelayedLoad(() => settleLoad(listAdminHouses()), { cacheKey: "admin:houses" });
  const [houses, setHouses] = useState<AdminHouse[]>([]);

  useEffect(() => {
    if (load.phase === "ready" && load.data) setHouses(load.data);
  }, [load.phase, load.data]);

  function patchHouse(saved: AdminHouse | null) {
    if (!saved) return;
    setHouses((current) => current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)));
  }

  const waiting = useMemo(() => houses.filter((house) => house.status === "pending"), [houses]);
  const rest = useMemo(() => houses.filter((house) => house.status !== "pending"), [houses]);

  return (
    <AppShell title="Houses" backTo="/admin">
      <div className="ops-board">
        <h1 className="ops-title">Houses</h1>
        <Queue
          title="Waiting"
          houses={waiting}
          phase={load.phase}
          empty="No applications right now."
          onPatch={patchHouse}
        />
        <Queue
          title="All houses"
          houses={rest}
          phase={load.phase}
          empty="No houses yet."
          onPatch={patchHouse}
        />
      </div>
    </AppShell>
  );
}

function Queue({
  title,
  houses,
  phase,
  empty,
  onPatch,
}: {
  title: string;
  houses: AdminHouse[];
  phase: "ready" | "waiting" | "skeleton" | "error";
  empty: string;
  onPatch: (house: AdminHouse) => void;
}) {
  return (
    <section className="ops-queue">
      <h2 className="ops-section">{title}</h2>
      {phase === "skeleton" ? (
        <div aria-hidden="true">
          <SkeletonAdminRow />
          <SkeletonAdminRow />
          <SkeletonAdminRow />
        </div>
      ) : null}
      {phase === "error" ? <p className="ops-lead">Couldn't load houses.</p> : null}
      {phase === "ready" && houses.length === 0 ? <p className="ops-lead">{empty}</p> : null}
      {phase === "ready" && houses.length > 0 ? (
        <div className="ops-table" role="table" aria-label={title}>
          <div className="ops-thead" role="row">
            <span>House</span>
            <span>Status</span>
            <span>Scouted</span>
            <span>Actions</span>
          </div>
          {houses.map((house) => (
            <HouseRow key={house.id} house={house} onPatch={onPatch} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HouseRow({ house, onPatch }: { house: AdminHouse; onPatch: (house: AdminHouse) => void }) {
  const actions = houseQueueActions(house.status).filter((action) => action.id !== "scouted");
  const live = house.status === "approved" || house.status === "disabled";
  return (
    <div className="ops-qrow" role="row" data-layout={live ? "live" : "buttons"} data-actions={actions.length}>
      <div className="ops-qhouse">
        <p className="ops-qname">{house.name}</p>
        <p className="ops-qcity">{house.city || "City not set"}</p>
      </div>
      <div className="ops-qbadge">
        <span className="ops-badge" data-status={house.status}>
          {queueStatusLabel(house.status)}
        </span>
      </div>
      <div className={cn("ops-qscout", house.status === "disabled" && "muted")}>
        <ScoutSwitch house={house} onPatch={onPatch} />
      </div>
      <div className="ops-qactions">
        {actions.map((action) => (
          <StatusAction key={action.id} house={house} action={action} onPatch={onPatch} />
        ))}
      </div>
    </div>
  );
}

function StatusAction({
  house,
  action,
  onPatch,
}: {
  house: AdminHouse;
  action: HouseQueueAction;
  onPatch: (house: AdminHouse) => void;
}) {
  const save = useOptimisticSave();
  return (
    <span className="ops-qaction">
      <button
        type="button"
        className={cn("ops-sm", action.id === "approve" || action.id === "enable" ? "ops-sm-solid" : "ops-sm-ghost")}
        aria-label={`${action.label} ${house.name}`}
        onClick={() => {
          if (!action.status) return;
          const previous = house;
          void save.run(
            async () => {
              const saved = await setHouseStatus({ data: { id: house.id, status: action.status! } });
              if (!saved) throw new Error("Could not update house.");
              return saved;
            },
            () => onPatch(previous),
            (saved) => onPatch({ ...house, ...saved }),
          );
        }}
      >
        {action.label}
      </button>
      <SaveStatus phase={save.phase} error={save.error} />
    </span>
  );
}

function ScoutSwitch({ house, onPatch }: { house: AdminHouse; onPatch: (house: AdminHouse) => void }) {
  const save = useOptimisticSave();
  const serverOn = house.status === "approved" && house.scouted;
  const [on, setOn] = useState(serverOn);
  useEffect(() => setOn(serverOn), [serverOn]);
  if (house.status !== "approved" && house.status !== "disabled") {
    return (
      <span className="ops-qcity" aria-hidden>
        —
      </span>
    );
  }
  const locked = house.status === "disabled";
  return (
    <>
      <span className="ops-scout-label">Scouted</span>
      <button
        type="button"
        role="switch"
        className={cn("ops-switch", !on && "off")}
        aria-checked={on}
        aria-disabled={locked || undefined}
        disabled={locked}
        aria-label={`Scouted, ${house.name}`}
        onClick={() => {
          if (locked) return;
          const next = !on;
          const previous = on;
          setOn(next);
          void save.run(
            async () => {
              const saved = await setLabelScouted({ data: { id: house.id, scouted: next } });
              if (!saved) throw new Error("Could not update Scouted.");
              return saved;
            },
            () => setOn(previous),
            (saved) => onPatch({ ...house, ...saved }),
          );
        }}
      />
      <SaveStatus phase={save.phase} error={save.error} />
    </>
  );
}
