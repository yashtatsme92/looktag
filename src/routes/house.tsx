import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SessionSplit } from "@/components/admin/admin-gate";
import { AccountSheet } from "@/components/home/account-sheet";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
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
  saveMyCollection,
  updateMyHouse,
} from "@/lib/labels/api";
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

  return (
    <SessionSplit>
      <AppShell title="House" backTo="/" header="hidden">
        {isPending || (user && house === undefined) ? (
          <p className="ops-lead">Checking your session…</p>
        ) : mode === "gate" ? (
          <HouseGate />
        ) : (
          <HouseStudio house={house ?? null} onHouse={setHouse} />
        )}
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
      <Link to="/" className="ops-scarce">
        Open the app
      </Link>
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
        toast.success("Collection added");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the collection.");
    } finally {
      setCollectionBusy(false);
    }
  }

  async function handleRemoveCollection(id: string) {
    try {
      await deleteMyCollection({ data: { id } });
      setCollections((current) => current.filter((item) => item.id !== id));
      toast.success("Collection removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the collection.");
    }
  }

  const managing = houseSessionMode({ signedIn: true, hasHouse: Boolean(house) }) === "manage";

  return (
    <div className="ops-stage">
      <Link to="/" className="ops-scarce">
        Back to Looktag
      </Link>
      <p className="ops-kicker">House</p>
      <div className="ops-title-row">
        <h1 className="ops-title">{managing && house ? house.name : "Apply"}</h1>
        {managing && house ? <span className="ops-chip">{queueStatusLabel(house.status)}</span> : null}
      </div>
      <p className="ops-lead">
        {managing
          ? house?.status === "disabled"
            ? "This house is disabled. It stays off Looktag until an admin enables it."
            : house?.status === "rejected"
              ? "This application was declined. Update it and submit again."
              : house?.status === "pending"
                ? "Waiting for admin. It stays hidden until then."
                : "Edit the house. Collections stay with it."
          : "First-time house — name, city, about."}
      </p>
      <form className="ops-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="ops-field">
          <Label htmlFor="house-name">House name</Label>
          <Input
            id="house-name"
            required
            minLength={2}
            value={name}
            autoComplete="organization"
            placeholder="Atelier Noir"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="ops-field">
          <Label htmlFor="house-city">City</Label>
          <Input
            id="house-city"
            value={city}
            autoComplete="address-level2"
            placeholder="Paris"
            onChange={(event) => setCity(event.target.value)}
          />
        </div>
        <div className="ops-field">
          <Label htmlFor="house-bio">About</Label>
          <Textarea
            id="house-bio"
            rows={3}
            value={bio}
            placeholder="Charcoal coats and numbered cuts."
            onChange={(event) => setBio(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : managing ? "Save changes" : "Submit"}
        </Button>
      </form>
      {managing ? (
        <section className="ops-block">
          <h2 className="ops-section">Collections</h2>
          <form className="ops-form" onSubmit={(event) => void handleAddCollection(event)}>
            <div className="ops-field">
              <Label htmlFor="collection-name">Add collection</Label>
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
              <Label htmlFor="collection-season">Season</Label>
              <Input
                id="collection-season"
                value={collectionSeason}
                placeholder="FW25"
                onChange={(event) => setCollectionSeason(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={collectionBusy}>
              {collectionBusy ? "Adding…" : "Add collection"}
            </Button>
          </form>
          {collections.length > 0 ? (
            <ul className="ops-collections">
              {collections.map((collection) => (
                <li key={collection.id} className="ops-collection">
                  <div>
                    <p className="ops-row-title">{collection.name}</p>
                    <p className="ops-row-note">{collection.season || "—"}</p>
                  </div>
                  <button type="button" className="ops-text-btn" onClick={() => void handleRemoveCollection(collection.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}