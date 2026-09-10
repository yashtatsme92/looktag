import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Chip } from "@/components/ds";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  applyHouse,
  deleteMyCollection,
  getMyHouse,
  listMyCollections,
  saveMyCollection,
  updateMyHouse,
} from "@/lib/labels/api";
import type { FashionCollection, FashionLabel } from "@/lib/labels/model";
import { MOODS } from "@/lib/looks/moods";

export const Route = createFileRoute("/houses_/apply")({ component: HouseApplyPage });

function HouseApplyPage() {
  const { user, isPending } = useCurrentUserState();
  const [mine, setMine] = useState<FashionLabel | null | undefined>(undefined);
  const [collections, setCollections] = useState<FashionCollection[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionSeason, setCollectionSeason] = useState("");
  const [collectionCaption, setCollectionCaption] = useState("");
  const [collectionBusy, setCollectionBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setMine(null);
      return;
    }
    let alive = true;
    void getMyHouse()
      .then(async (row) => {
        if (!alive) return;
        setMine(row);
        if (row) {
          setName(row.name);
          setCity(row.city);
          setBio(row.bio);
          setMoods(row.moods);
          const next = await listMyCollections().catch(() => []);
          if (alive) setCollections(next);
        }
      })
      .catch(() => {
        if (alive) setMine(null);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (isPending) {
    return (
      <AppShell title="House" backTo="/houses">
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: "/houses/apply" }} />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = mine
        ? await updateMyHouse({ data: { name, city, bio, moods } })
        : await applyHouse({ data: { name, city, bio, moods } });
      if (saved) {
        setMine(saved);
        toast.success(
          mine
            ? saved.status === "pending" && mine.status === "rejected"
              ? "Sent again. Admin will review it."
              : "House updated"
            : "Application sent. Admin will review it.",
        );
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
        data: { name: collectionName, season: collectionSeason, caption: collectionCaption },
      });
      if (saved) {
        setCollections((current) => [...current, saved]);
        setCollectionName("");
        setCollectionSeason("");
        setCollectionCaption("");
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

  const submitLabel = !mine
    ? "Send for approval"
    : mine.status === "rejected"
      ? "Send again"
      : "Save house";

  return (
    <AppShell title="House" backTo="/houses">
      <ScreenTitle kicker="Houses">{mine ? "Manage house" : "Register a house"}</ScreenTitle>
      {mine ? (
        <div className="mb-6 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="ds-card-title">{mine.name}</p>
            <StatusBadge status={mine.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {mine.status === "approved"
              ? "Your house is live on Looktag. Edit details and collections below."
              : mine.status === "rejected"
                ? "This application was declined. Update it and send again."
                : "Waiting for admin approval. It stays hidden until then."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {mine.city || "City not set"} · @{mine.handle}
          </p>
          {mine.status === "approved" ? (
            <Button asChild className="mt-5">
              <Link to="/houses/$labelId" params={{ labelId: mine.id }}>
                Open house
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="mt-5">
              <Link to="/houses">Back to houses</Link>
            </Button>
          )}
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">
          Tell us about the label. Admin reviews every house before it appears in the app.
        </p>
      )}

      <form className="mb-8 flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex flex-col gap-1.5">
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="house-city">City</Label>
          <Input
            id="house-city"
            value={city}
            autoComplete="address-level2"
            placeholder="Paris"
            onChange={(event) => setCity(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="house-bio">About</Label>
          <Textarea
            id="house-bio"
            rows={3}
            value={bio}
            placeholder="Evening tailoring in small runs."
            onChange={(event) => setBio(event.target.value)}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Moods</p>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood) => {
              const selected = moods.includes(mood.id);
              return (
                <Chip
                  key={mood.id}
                  selected={selected}
                  onClick={() =>
                    setMoods((current) =>
                      selected
                        ? current.filter((id) => id !== mood.id)
                        : [...current, mood.id].slice(0, 4),
                    )
                  }
                >
                  {mood.label}
                </Chip>
              );
            })}
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </form>

      {mine ? (
        <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
          <h2 className="ds-card-title">Collections</h2>
          <p className="mt-2 mb-4 text-sm text-muted-foreground">
            Group looks — Summer Blues, Kinkistyles. They go live with the house.
          </p>
          {collections.length > 0 ? (
            <ul className="mb-4 flex flex-col">
              {collections.map((collection) => (
                <li
                  key={collection.id}
                  className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="ds-card-title">{collection.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[collection.season, collection.caption].filter(Boolean).join(" · ") ||
                        "No season yet"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleRemoveCollection(collection.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">No collections yet.</p>
          )}
          <form className="flex flex-col gap-3" onSubmit={(event) => void handleAddCollection(event)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="collection-name">Collection name</Label>
              <Input
                id="collection-name"
                required
                minLength={2}
                value={collectionName}
                placeholder="Summer Blues"
                onChange={(event) => setCollectionName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="collection-season">Season</Label>
              <Input
                id="collection-season"
                value={collectionSeason}
                placeholder="SS26"
                onChange={(event) => setCollectionSeason(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="collection-caption">Caption</Label>
              <Input
                id="collection-caption"
                value={collectionCaption}
                placeholder="Salt air, washed linen."
                onChange={(event) => setCollectionCaption(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={collectionBusy}>
              {collectionBusy ? "Adding…" : "Add collection"}
            </Button>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}

function StatusBadge({ status }: { status: FashionLabel["status"] }) {
  const label = status === "approved" ? "Live" : status === "pending" ? "Pending" : "Declined";
  return <Badge variant={status === "approved" ? "default" : "muted"}>{label}</Badge>;
}
