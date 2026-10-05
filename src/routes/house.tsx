import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
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
  deleteMyStyle,
  getMyHouse,
  listFashionLabels,
  listMyCollections,
  listMyStyles,
  moveMyCollection,
  moveMyStyle,
  saveMyCollection,
  saveMyStyle,
  updateMyHouse,
} from "@/lib/labels/api";
import { readLookImage } from "@/lib/looks/image";
import { useSettingsStore } from "@/lib/settings/store";
import {
  consumerHouseIndex,
  houseSessionMode,
  queueStatusLabel,
  type FashionCollection,
  type FashionLabel,
  type FashionStyle,
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
  const [styles, setStyles] = useState<FashionStyle[]>([]);
  const [name, setName] = useState(house?.name ?? "");
  const [city, setCity] = useState(house?.city ?? "");
  const [bio, setBio] = useState(house?.bio ?? "");
  const [website, setWebsite] = useState(house?.website ?? "");
  const [coverSrc, setCoverSrc] = useState(house?.coverSrc ?? "");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<HouseEditor>(null);
  const [lineName, setLineName] = useState("");
  const [lineTag, setLineTag] = useState("");
  const [lineNote, setLineNote] = useState("");
  const [lineBusy, setLineBusy] = useState(false);
  const [styleName, setStyleName] = useState("");
  const [styleNote, setStyleNote] = useState("");
  const [stylePhotos, setStylePhotos] = useState<string[]>([]);
  const [styleBusy, setStyleBusy] = useState(false);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    if (!house || house.status !== "approved") return;
    let alive = true;
    void listMyCollections()
      .then((rows) => {
        if (alive) setCollections(rows);
      })
      .catch(() => {
        if (alive) setCollections([]);
      });
    void listMyStyles()
      .then((rows) => {
        if (alive) setStyles(rows);
      })
      .catch(() => {
        if (alive) setStyles([]);
      });
    return () => {
      alive = false;
    };
  }, [house?.id, house?.status]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = house
        ? await updateMyHouse({ data: { name, city, bio, moods: house.moods, website, coverSrc } })
        : await applyHouse({ data: { name, city, bio, moods: [] } });
      if (saved) {
        onHouse(saved);
        setName(saved.name);
        setCity(saved.city);
        setBio(saved.bio);
        setWebsite(saved.website ?? "");
        setCoverSrc(saved.coverSrc ?? "");
        toast.success(house ? "House updated" : "Application sent. Admin will review it.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the house.");
    } finally {
      setBusy(false);
    }
  }

  async function onCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setCoverSrc(await readLookImage(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that photo.");
    }
  }

  function openLine(collection?: FashionCollection) {
    setEditor(collection ? { kind: "line", id: collection.id } : { kind: "line" });
    setLineName(collection?.name ?? "");
    setLineTag(collection?.season ?? "");
    setLineNote(collection?.caption ?? "");
  }

  function openStyle(lineId: string, style?: FashionStyle) {
    setEditor({ kind: "style", lineId, id: style?.id });
    setStyleName(style?.name ?? "");
    setStyleNote(style?.description ?? "");
    setStylePhotos(style?.images?.length ? style.images : style?.imageSrc ? [style.imageSrc] : []);
  }

  async function saveLine() {
    setLineBusy(true);
    try {
      const id = editor?.kind === "line" ? editor.id : undefined;
      const saved = await saveMyCollection({
        data: { id, name: lineName, season: lineTag, caption: lineNote },
      });
      if (saved) {
        setCollections((current) => {
          const rest = current.filter((item) => item.id !== saved.id);
          return [...rest, saved].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        });
        setEditor({ kind: "line", id: saved.id });
        toast.success(id ? "Line updated" : "Line added");
        return saved.id;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the line.");
    } finally {
      setLineBusy(false);
    }
    return null;
  }

  async function handleRemoveCollection(id: string) {
    try {
      await deleteMyCollection({ data: { id } });
      setCollections((current) => current.filter((item) => item.id !== id));
      setStyles((current) => current.filter((item) => item.collectionId !== id));
      toast.success("Line removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the line.");
    }
  }

  async function moveLine(id: string, direction: "up" | "down") {
    try {
      setCollections(await moveMyCollection({ data: { id, direction } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder the line.");
    }
  }

  async function dropLine(targetId: string) {
    const id = dragId.current;
    dragId.current = null;
    if (!id || id === targetId) return;
    const from = collections.findIndex((row) => row.id === id);
    const to = collections.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;
    const direction = to > from ? "down" : "up";
    try {
      let next = collections;
      for (let step = 0; step < Math.abs(to - from); step += 1) {
        next = await moveMyCollection({ data: { id, direction } });
      }
      setCollections(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder the line.");
    }
  }

  async function saveStyle(event: FormEvent) {
    event.preventDefault();
    if (editor?.kind !== "style") return;
    setStyleBusy(true);
    try {
      const saved = await saveMyStyle({
        data: {
          id: editor.id,
          collectionId: editor.lineId,
          name: styleName,
          description: styleNote,
          imageSrc: stylePhotos[0] ?? "",
          images: stylePhotos,
        },
      });
      setStyles((current) => {
        const rest = current.filter((item) => item.id !== saved.id);
        return [...rest, saved];
      });
      setEditor({ kind: "style", lineId: editor.lineId, id: saved.id });
      if (!coverSrc) setCoverSrc(saved.imageSrc);
      toast.success("Style saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the style.");
    } finally {
      setStyleBusy(false);
    }
  }

  async function onStylePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const next = [...stylePhotos];
    try {
      for (const file of files) {
        if (next.length >= 6) break;
        next.push(await readLookImage(file));
      }
      setStylePhotos(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that photo.");
    }
  }

  async function removeStyle(style: FashionStyle) {
    try {
      await deleteMyStyle({ data: { id: style.id } });
      const rest = styles.filter((item) => item.id !== style.id);
      setStyles(rest);
      const photos = new Set(style.images?.length ? style.images : [style.imageSrc]);
      if (coverSrc && photos.has(coverSrc)) {
        setCoverSrc(rest[0]?.imageSrc ?? "");
      }
      toast.success("Style removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the style.");
    }
  }

  async function moveStyle(id: string, direction: "up" | "down") {
    try {
      setStyles(await moveMyStyle({ data: { id, direction } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder the style.");
    }
  }

  async function dropStyle(targetId: string, lineId: string) {
    const id = dragId.current;
    dragId.current = null;
    if (!id || id === targetId) return;
    const siblings = styles
      .filter((style) => style.collectionId === lineId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const from = siblings.findIndex((row) => row.id === id);
    const to = siblings.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;
    const direction = to > from ? "down" : "up";
    try {
      let next = styles;
      for (let step = 0; step < Math.abs(to - from); step += 1) {
        next = await moveMyStyle({ data: { id, direction } });
      }
      setStyles(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reorder the style.");
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

  const lineId = editor?.kind === "line" ? editor.id : editor?.kind === "style" ? editor.lineId : undefined;
  const lineStyles = styles
    .filter((style) => style.collectionId === lineId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <div className="house-manage" data-editor={editor ? "open" : "closed"}>
      <form className="contents" onSubmit={(event) => void handleSubmit(event)}>
        <section className="house-details" aria-label="House details">
          <p className="ops-kicker">House</p>
          <div className="ops-title-row">
            <h1 className="ops-title">{house?.name || "House"}</h1>
            {house ? <span className="ops-badge" data-status={house.status}>{queueStatusLabel(house.status)}</span> : null}
          </div>
          <HouseFields name={name} city={city} bio={bio} onName={setName} onCity={setCity} onBio={setBio} />
          <div className="ops-field">
            <Label htmlFor="house-website">Website</Label>
            <Input
              id="house-website"
              value={website}
              placeholder="https://atelier.example"
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
          <div className="ops-field">
            <Label htmlFor="house-cover">Cover</Label>
            {coverSrc ? <img className="house-cover-preview" src={coverSrc} alt="" /> : null}
            <div className="house-line-actions">
              <label className="house-ghost" htmlFor="house-cover">
                {coverSrc ? "Change cover" : "Add cover"}
              </label>
              {coverSrc ? (
                <button type="button" className="house-ghost" onClick={() => setCoverSrc("")}>
                  Remove cover
                </button>
              ) : null}
            </div>
            <input id="house-cover" className="house-file" type="file" accept="image/*" onChange={(event) => void onCover(event)} />
          </div>
        </section>
        <div className="house-save">
          <button type="submit" className="house-primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
      {editor?.kind === "style" ? (
        <form className="house-editor" onSubmit={(event) => void saveStyle(event)}>
          <button type="button" className="house-ghost" onClick={() => setEditor({ kind: "line", id: editor.lineId })}>
            Back
          </button>
          <h2 className="ops-section">{editor.id ? "Style" : "New style"}</h2>
          <div className="house-photos">
            {stylePhotos.map((src, index) => (
              <figure key={`${index}-${src.slice(0, 24)}`} className="house-photo">
                <img src={src} alt="" />
                <button
                  type="button"
                  className="house-ghost"
                  aria-label={`Remove photo ${index + 1}`}
                  onClick={() => setStylePhotos((current) => current.filter((_, photo) => photo !== index))}
                >
                  Remove
                </button>
              </figure>
            ))}
          </div>
          {stylePhotos.length < 6 ? (
            <div className="ops-field">
              <label className="house-ghost" htmlFor="style-photos">
                Add photo
              </label>
              <input
                id="style-photos"
                className="house-file"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => void onStylePhotos(event)}
              />
            </div>
          ) : null}
          <div className="ops-field">
            <Label htmlFor="style-name">Name</Label>
            <Input
              id="style-name"
              required
              minLength={2}
              value={styleName}
              placeholder="Column Dress"
              onChange={(event) => setStyleName(event.target.value)}
            />
          </div>
          <div className="ops-field">
            <Label htmlFor="style-note">Description</Label>
            <Textarea
              id="style-note"
              rows={3}
              value={styleNote}
              placeholder="A black wool column. No price."
              onChange={(event) => setStyleNote(event.target.value)}
            />
          </div>
          <button type="submit" className="house-primary" disabled={styleBusy}>
            {styleBusy ? "Saving…" : "Save changes"}
          </button>
        </form>
      ) : editor?.kind === "line" ? (
        <section className="house-editor" aria-label="Line">
          <button type="button" className="house-ghost" onClick={() => setEditor(null)}>
            Back
          </button>
          <h2 className="ops-section">{editor.id ? "Line" : "New line"}</h2>
          <div className="ops-field">
            <Label htmlFor="line-name">Name</Label>
            <Input
              id="line-name"
              required
              minLength={2}
              value={lineName}
              placeholder="Kinkistyles"
              onChange={(event) => setLineName(event.target.value)}
            />
          </div>
          <div className="ops-field">
            <Label htmlFor="line-tag">Tag</Label>
            <Input id="line-tag" value={lineTag} placeholder="Capsule" onChange={(event) => setLineTag(event.target.value)} />
          </div>
          <div className="ops-field">
            <Label htmlFor="line-note">Note</Label>
            <Textarea
              id="line-note"
              rows={3}
              value={lineNote}
              placeholder="Sculptural black."
              onChange={(event) => setLineNote(event.target.value)}
            />
          </div>
          <button type="button" className="house-primary" disabled={lineBusy} onClick={() => void saveLine()}>
            {lineBusy ? "Saving…" : "Save changes"}
          </button>
          <div className="house-collections-head">
            <h3 className="ops-section">Styles</h3>
            <button
              type="button"
              className="house-ghost"
              disabled={lineBusy}
              onClick={() => {
                void (async () => {
                  const id = editor.id ?? (await saveLine());
                  if (id) openStyle(id);
                })();
              }}
            >
              Add style
            </button>
          </div>
          {lineStyles.length === 0 ? (
            <p className="ops-lead">No Styles in this Line yet.</p>
          ) : (
            <ul className="ops-collections">
              {lineStyles.map((style, index) => (
                <li
                  key={style.id}
                  className="ops-collection"
                  draggable
                  onDragStart={() => {
                    dragId.current = style.id;
                  }}
                  onDragOver={(event: DragEvent) => event.preventDefault()}
                  onDrop={() => void dropStyle(style.id, style.collectionId)}
                >
                  <img className="house-thumb" src={style.imageSrc} alt="" />
                  <div>
                    <p className="ops-row-title">{style.name}</p>
                  </div>
                  <div className="house-line-actions">
                    <button type="button" className="house-ghost" disabled={index === 0} onClick={() => void moveStyle(style.id, "up")}>
                      Move up
                    </button>
                    <button
                      type="button"
                      className="house-ghost"
                      disabled={index === lineStyles.length - 1}
                      onClick={() => void moveStyle(style.id, "down")}
                    >
                      Move down
                    </button>
                    <button type="button" className="house-ghost" onClick={() => openStyle(style.collectionId, style)}>
                      Edit
                    </button>
                    <button type="button" className="house-ghost" aria-label={`Remove ${style.name}`} onClick={() => void removeStyle(style)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="house-collections" aria-label="Lines">
          <div className="house-collections-head">
            <h2 className="ops-section">Lines</h2>
            <button type="button" className="house-ghost" onClick={() => openLine()}>
              Add line
            </button>
          </div>
          {collections.length === 0 ? (
            <p className="ops-lead">No Lines yet. Add your first Line.</p>
          ) : (
            <ul className="ops-collections">
              {collections.map((collection, index) => (
                <li
                  key={collection.id}
                  className="ops-collection"
                  draggable
                  onDragStart={() => {
                    dragId.current = collection.id;
                  }}
                  onDragOver={(event: DragEvent) => event.preventDefault()}
                  onDrop={() => void dropLine(collection.id)}
                >
                  <div>
                    <p className="ops-row-title">{collection.name}</p>
                    <p className="ops-row-note">{collection.season || "—"}</p>
                  </div>
                  <div className="house-line-actions">
                    <button type="button" className="house-ghost" disabled={index === 0} onClick={() => void moveLine(collection.id, "up")}>
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
                    <button type="button" className="house-ghost" onClick={() => openLine(collection)}>
                      Edit
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
      )}
    </div>
  );
}

type HouseEditor = { kind: "line"; id?: string } | { kind: "style"; lineId: string; id?: string } | null;

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
