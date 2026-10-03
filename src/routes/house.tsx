import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SessionSplit } from "@/components/admin/admin-gate";
import { AccountSheet } from "@/components/home/account-sheet";
import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  applyHouse,
  deleteMyCollection,
  getMyHouse,
  listFashionLabels,
  listMyCollections,
  moveMyCollection,
  saveMyCollection,
  updateMyHouse,
} from "@/lib/labels/api";
import { useSettingsStore } from "@/lib/settings/store";
import {
  consumerHouseIndex,
  houseSessionMode,
  queueStatusLabel,
  type FashionCollection,
  type FashionLabel,
} from "@/lib/labels/model";

export const Route = createFileRoute("/house")({ component: HouseSession });

function HouseSession() {
  const { user, isPending } = useCurrentUserState();
  const [house, setHouse] = useState<FashionLabel | null | undefined>(undefined);

  useEffect(() => {
    if (!user) {
      setHouse(null);
      return;
    }
    let alive = true;
    void getMyHouse()
      .then((row) => {
        if (alive) setHouse(row);
      })
      .catch(() => {
        if (alive) setHouse(null);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const mode = houseSessionMode({
    signedIn: Boolean(user),
    hasHouse: Boolean(house),
  });
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const settingsReady = useSettingsStore((s) => s.hydrated);

  return (
    <SessionSplit>
      <AppShell title="House" backTo="/" header="hidden" flush>
        <div className="house-session">
          <header className="house-bar">
            <div className="house-bar-inner">
              <Link to="/" className="web-wordmark">
                Looktag
              </Link>
              <Link to="/" className="house-back">
                Back to Looktag
              </Link>
            </div>
          </header>
          <div className="house-body">
            {isPending || (user && house === undefined) ? (
              <p className="ops-lead">Checking your session…</p>
            ) : !housesOn && settingsReady && mode === "manage" ? (
              <HouseNotice
                title="Houses are paused"
                body="Houses are paused on Looktag right now. Your Lines and Styles are safe."
              />
            ) : !housesOn && settingsReady ? (
              <HouseNotice
                title="Houses aren't available right now"
                body=""
              />
            ) : mode === "gate" ? (
              <HouseGate />
            ) : (
              <HouseStudio house={house ?? null} onHouse={setHouse} />
            )}
          </div>
        </div>
      </AppShell>
    </SessionSplit>
  );
}

function HouseGate() {
  const navigate = useNavigate();
  const [labels, setLabels] = useState<FashionLabel[]>([]);

  useEffect(() => {
    let alive = true;
    void listFashionLabels()
      .then((rows) => {
        if (alive) setLabels(rows);
      })
      .catch(() => {
        if (alive) setLabels([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const index = useMemo(() => consumerHouseIndex(labels), [labels]);

  return (
    <div className="ops-stage">
      <p className="ops-kicker">Houses</p>
      <h1 className="ops-title">For houses</h1>
      <HouseNameList
        title="Scouted"
        note="Picked by Looktag — clothes and covers first."
        labels={index.scouted}
      />
      <HouseNameList title="More houses" labels={index.more} />
      <p className="ops-lead">Shopping Looktag?</p>
      <AccountSheet
        open
        onOpenChange={(open) => {
          if (!open) void navigate({ to: "/" });
        }}
        title="Continue as a House"
        description="Cancel returns. House session — apply and manage stay here."
        primary="Continue with email"
        secondary="Cancel"
        next="/house"
      />
    </div>
  );
}

function HouseNameList({
  title,
  note,
  labels,
}: {
  title: string;
  note?: string;
  labels: FashionLabel[];
}) {
  if (labels.length === 0) return null;
  return (
    <section className="ops-block">
      <h2 className="ops-section">{title}</h2>
      {note ? <p className="ops-lead">{note}</p> : null}
      <ul>
        {labels.map((label) => (
          <li key={label.id}>
            <Link to="/houses/$labelId" params={{ labelId: label.id }} className="ops-name-row">
              <span>{label.name}</span>
              {label.city ? <span className="ops-row-note">{label.city}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HouseStudio({
  house,
  onHouse,
}: {
  house: FashionLabel | null;
  onHouse: (house: FashionLabel | null) => void;
}) {
  const [collections, setCollections] = useState<FashionCollection[]>([]);
  const [name, setName] = useState(house?.name ?? "");
  const [city, setCity] = useState(house?.city ?? "");
  const [bio, setBio] = useState(house?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionSeason, setCollectionSeason] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);

  useEffect(() => {
    if (!house) return;
    let alive = true;
    void listMyCollections()
      .then((rows) => {
        if (alive) setCollections(rows);
      })
      .catch(() => {
        if (alive) setCollections([]);
      });
    return () => {
      alive = false;
    };
  }, [house?.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = house
        ? await updateMyHouse({ data: { name, city, bio, moods: house.moods } })
        : await applyHouse({ data: { name, city, bio, moods: [] } });
      if (saved) {
        onHouse(saved);
        setName(saved.name);
        setCity(saved.city);
        setBio(saved.bio);
        toast.success(house ? "House updated" : "Application sent. Admin will review it.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the house.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCollection(event: FormEvent) {
    event.preventDefault();
    setCollectionBusy(true);
    try {
      const saved = await saveMyCollection({
        data: { name: collectionName, season: collectionSeason, caption: "" },
      });
      if (saved) {
        setCollections((current) => [...current, saved]);
        setCollectionName("");
        setCollectionSeason("");
        toast.success("Line added");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the line.");
    } finally {
      setCollectionBusy(false);
    }
  }

  async function handleRemoveCollection(id: string) {
    try {
      await deleteMyCollection({ data: { id } });
      setCollections((current) => current.filter((item) => item.id !== id));
      toast.success("Line removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the line.");
    }
  }

  async function moveLine(id: string, direction: "up" | "down") {
    try {
      const next = await moveMyCollection({ data: { id, direction } });
      setCollections(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder the line.");
    }
  }

  const managing = houseSessionMode({ signedIn: true, hasHouse: Boolean(house) }) === "manage";

  if (managing && house && (house.status === "pending" || house.status === "hold")) {
    return (
      <HouseNotice
        title="Application in review"
        body="Thanks for applying. We'll email you once your House is reviewed."
      />
    );
  }

  if (managing && house?.status === "rejected") {
    return (
      <HouseNotice
        title="Application not approved"
        body="Your House wasn't approved this time. You can still browse and save looks."
      />
    );
  }

  if (managing && house?.status === "disabled") {
    return (
      <HouseNotice
        title="House paused"
        body="Your House is hidden from shoppers right now. Your Lines and Styles are safe."
      />
    );
  }

  if (!managing) {
    return (
      <form className="house-apply" onSubmit={(event) => void handleSubmit(event)}>
        <p className="ops-kicker">House</p>
        <h1 className="ops-title">Apply</h1>
        <p className="ops-lead">First-time house — name, city, about.</p>
        <HouseFields name={name} city={city} bio={bio} onName={setName} onCity={setCity} onBio={setBio} />
        <button type="submit" className="house-primary" disabled={busy}>
          {busy ? "Saving…" : "Submit"}
        </button>
      </form>
    );
  }

  return (
    <div className="house-manage">
      <form className="contents" onSubmit={(event) => void handleSubmit(event)}>
        <section className="house-details" aria-label="House details">
          <p className="ops-kicker">House</p>
          <div className="ops-title-row">
            <h1 className="ops-title">{house?.name || "House"}</h1>
            {house ? <span className="ops-badge" data-status={house.status}>{queueStatusLabel(house.status)}</span> : null}
          </div>
          <HouseFields name={name} city={city} bio={bio} onName={setName} onCity={setCity} onBio={setBio} />
        </section>
        <div className="house-save">
          <button type="submit" className="house-primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
      <section className="house-collections" aria-label="Lines">
        <div className="house-collections-head">
          <h2 className="ops-section">Lines</h2>
        </div>
        <form className="house-add" onSubmit={(event) => void handleAddCollection(event)}>
          <div className="ops-field">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              required
              minLength={2}
              value={collectionName}
              placeholder="Kinkistyles"
              onChange={(event) => setCollectionName(event.target.value)}
            />
          </div>
          <div className="ops-field">
            <Label htmlFor="collection-season">Tag</Label>
            <Input
              id="collection-season"
              value={collectionSeason}
              placeholder="Capsule"
              onChange={(event) => setCollectionSeason(event.target.value)}
            />
          </div>
          <button type="submit" className="house-ghost" disabled={collectionBusy}>
            {collectionBusy ? "Adding…" : "Add line"}
          </button>
        </form>
        {collections.length === 0 ? (
          <p className="ops-lead">No Lines yet. Add your first Line.</p>
        ) : (
          <ul className="ops-collections">
            {collections.map((collection, index) => (
              <li key={collection.id} className="ops-collection">
                <div>
                  <p className="ops-row-title">{collection.name}</p>
                  <p className="ops-row-note">{collection.season || "—"}</p>
                </div>
                <div className="house-line-actions">
                  <button
                    type="button"
                    className="house-ghost"
                    disabled={index === 0}
                    onClick={() => void moveLine(collection.id, "up")}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    className="house-ghost"
                    disabled={index === collections.length - 1}
                    onClick={() => void moveLine(collection.id, "down")}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    className="house-ghost"
                    aria-label={`Remove ${collection.name}`}
                    onClick={() => void handleRemoveCollection(collection.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HouseNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="house-apply">
      <p className="ops-kicker">House</p>
      <h1 className="ops-title">{title}</h1>
      {body ? <p className="ops-lead">{body}</p> : null}
      <Link to="/" className="house-exit">
        Back to Looks
      </Link>
    </div>
  );
}

function HouseFields({
  name,
  city,
  bio,
  onName,
  onCity,
  onBio,
}: {
  name: string;
  city: string;
  bio: string;
  onName: (value: string) => void;
  onCity: (value: string) => void;
  onBio: (value: string) => void;
}) {
  return (
    <div className="house-fields">
      <div className="ops-field">
        <Label htmlFor="house-name">House name</Label>
        <Input
          id="house-name"
          required
          minLength={2}
          value={name}
          autoComplete="organization"
          placeholder="Atelier Noir"
          onChange={(event) => onName(event.target.value)}
        />
      </div>
      <div className="ops-field">
        <Label htmlFor="house-city">City</Label>
        <Input
          id="house-city"
          value={city}
          autoComplete="address-level2"
          placeholder="Paris"
          onChange={(event) => onCity(event.target.value)}
        />
      </div>
      <div className="ops-field">
        <Label htmlFor="house-bio">About</Label>
        <Textarea
          id="house-bio"
          rows={3}
          value={bio}
          placeholder="Charcoal coats and numbered cuts."
          onChange={(event) => onBio(event.target.value)}
        />
      </div>
    </div>
  );
}
