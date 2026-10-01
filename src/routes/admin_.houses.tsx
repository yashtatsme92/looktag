import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/admin-gate";
import { AppShell } from "@/components/layout/app-shell";
import { listAdminHouses, setHouseStatus, setLabelScouted, type AdminHouse } from "@/lib/labels/api";
import { houseQueueActions, queueStatusLabel, type HouseStatus } from "@/lib/labels/model";
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
              : status === "hold"
                ? "House on hold"
                : "Moved to waiting",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update house.");
    }
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
          loaded={loaded}
          empty="No applications right now."
          onStatus={patchStatus}
          onScouted={patchHouse}
        />
        <Queue
          title="All houses"
          houses={rest}
          loaded={loaded}
          empty="No houses yet."
          onStatus={patchStatus}
          onScouted={patchHouse}
        />
      </div>
    </AppShell>
  );
}

function Queue({
  title,
  houses,
  loaded,
  empty,
  onStatus,
  onScouted,
}: {
  title: string;
  houses: AdminHouse[];
  loaded: boolean;
  empty: string;
  onStatus: (id: string, status: HouseStatus) => void;
  onScouted: (house: AdminHouse) => void;
}) {
  return (
    <section className="ops-queue">
      <h2 className="ops-section">{title}</h2>
      {!loaded ? <p className="ops-lead">Loading…</p> : null}
      {loaded && houses.length === 0 ? <p className="ops-lead">{empty}</p> : null}
      {houses.length > 0 ? (
        <div className="ops-table" role="table" aria-label={title}>
          <div className="ops-thead" role="row">
            <span>House</span>
            <span>Status</span>
            <span>Scouted</span>
            <span>Actions</span>
          </div>
          {houses.map((house) => (
            <HouseRow key={house.id} house={house} onStatus={onStatus} onScouted={onScouted} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HouseRow({
  house,
  onStatus,
  onScouted,
}: {
  house: AdminHouse;
  onStatus: (id: string, status: HouseStatus) => void;
  onScouted: (house: AdminHouse) => void;
}) {
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
        <ScoutSwitch house={house} onScouted={onScouted} />
      </div>
      <div className="ops-qactions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={cn("ops-sm", action.id === "approve" || action.id === "enable" ? "ops-sm-solid" : "ops-sm-ghost")}
            aria-label={`${action.label} ${house.name}`}
            onClick={() => {
              if (action.status) onStatus(house.id, action.status);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoutSwitch({
  house,
  onScouted,
}: {
  house: AdminHouse;
  onScouted: (house: AdminHouse) => void;
}) {
  if (house.status !== "approved" && house.status !== "disabled") {
    return (
      <span className="ops-qcity" aria-hidden>
        —
      </span>
    );
  }
  const locked = house.status === "disabled";
  const on = house.status === "approved" && house.scouted;
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
          void setLabelScouted({ data: { id: house.id, scouted: !house.scouted } })
            .then((saved) => {
              if (saved) onScouted({ ...house, ...saved });
            })
            .catch(() => toast.error("Could not update Scouted."));
        }}
      />
    </>
  );
}
