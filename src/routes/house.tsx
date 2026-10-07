import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SessionSplit } from "@/components/admin/admin-gate";
import { AccountSheet } from "@/components/home/account-sheet";
import { AppShell } from "@/components/layout/app-shell";
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
  lineStyleMeta,
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
              <Link to="/" className="house-back house-back-phone">
                Back to Looktag
              </Link>
              <span className="house-bar-title">House</span>
              <span className="house-bar-pad" aria-hidden />
              <Link to="/" className="web-wordmark house-wordmark">
                Looktag
              </Link>
              <Link to="/" className="house-back house-back-wide">
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
  const photoDrag = useRef<number | null>(null);

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
        <p className="studio-kicker studio-wide-only">House</p>
        <h1 className="studio-h1">Apply</h1>
        <p className="studio-sub">First-time house — name, city, about. No moods.</p>
        <HouseFields
          name={name}
          city={city}
          bio={bio}
          onName={setName}
          onCity={setCity}
          onBio={setBio}
          placeholders
        />
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

  const styleLine =
    editor?.kind === "style" ? collections.find((row) => row.id === editor.lineId) : null;
  const styleLineName = styleLine?.name || lineName || "Line";

  function addStyle() {
    void (async () => {
      const id = editor?.kind === "line" ? (editor.id ?? (await saveLine())) : null;
      if (id) openStyle(id);
    })();
  }

  function dropPhoto(index: number) {
    const from = photoDrag.current;
    photoDrag.current = null;
    if (from == null || from === index) return;
    setStylePhotos((current) => {
      const next = current.slice();
      const [item] = next.splice(from, 1);
      if (!item) return current;
      next.splice(index, 0, item);
      return next;
    });
  }

  if (editor?.kind === "style") {
    const styleTitle = styleName.trim() || "New style";
    return (
      <form className="studio" data-screen="style" onSubmit={(event) => void saveStyle(event)}>
        <header className="studio-phone-hd">
          <button type="button" onClick={() => setEditor({ kind: "line", id: editor.lineId })}>
            <IconChevron />
            {styleLineName}
          </button>
          <span className="studio-phone-title">Style</span>
          <span className="house-bar-pad" aria-hidden />
        </header>
        <div className="studio-scroll">
          <button
            type="button"
            className="studio-back-wide"
            onClick={() => setEditor({ kind: "line", id: editor.lineId })}
          >
            <IconChevron />
            Back to {styleLineName}
          </button>
          <p className="studio-kicker">{styleLineName} · Style</p>
          <h1 className="studio-h1">{styleTitle}</h1>
          <div className="studio-style-card">
            <div className="studio-stack">
              <div>
                <span className="studio-label">Photos</span>
                <div className="studio-photos">
                  {stylePhotos.map((src, index) => (
                    <div
                      key={`${index}-${src.slice(0, 24)}`}
                      className="studio-photo"
                      draggable
                      onDragStart={() => {
                        photoDrag.current = index;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropPhoto(index)}
                    >
                      <img src={src} alt={`Photo ${index + 1}`} />
                    </div>
                  ))}
                  {stylePhotos.length < 6 ? (
                    <label className="studio-addph" htmlFor="style-photos">
                      <IconPlus />
                      <span>Add photo</span>
                    </label>
                  ) : null}
                </div>
                <input
                  id="style-photos"
                  className="house-file"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void onStylePhotos(event)}
                />
                <p className="studio-photo-note">First photo is the cover. Drag to reorder.</p>
              </div>
              <div>
                <label className="studio-label" htmlFor="style-name">
                  Style name
                </label>
                <input
                  id="style-name"
                  className="studio-field"
                  required
                  minLength={2}
                  value={styleName}
                  onChange={(event) => setStyleName(event.target.value)}
                />
              </div>
              <div>
                <label className="studio-label" htmlFor="style-note">
                  Description
                </label>
                <textarea
                  id="style-note"
                  className="studio-area"
                  rows={3}
                  value={styleNote}
                  onChange={(event) => setStyleNote(event.target.value)}
                />
              </div>
            </div>
            <div className="studio-card-save studio-wide-only">
              <button type="submit" className="house-primary" disabled={styleBusy}>
                {styleBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
        <div className="studio-save studio-phone-only">
          <button type="submit" className="house-primary" disabled={styleBusy}>
            {styleBusy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    );
  }

  if (editor?.kind === "line") {
    const lineTitle = lineName.trim() || "New line";
    const emptyStyles = lineStyles.length === 0;
    return (
      <section className="studio" data-screen="line" aria-label="Line">
        <header className="studio-phone-hd">
          <button type="button" onClick={() => setEditor(null)}>
            <IconChevron />
            Lines
          </button>
          <span className="studio-phone-title">Line</span>
          <span className="house-bar-pad" aria-hidden />
        </header>
        <div className="studio-scroll">
          <button type="button" className="studio-back-wide" onClick={() => setEditor(null)}>
            <IconChevron />
            Back to Lines
          </button>
          <p className="studio-kicker">{house?.name || "House"} · Line</p>
          <h1 className="studio-h1">{lineTitle}</h1>
          <div className="studio-split">
            <div className="studio-fields">
              <div className="studio-stack">
                <div>
                  <label className="studio-label" htmlFor="line-name">
                    Line name
                  </label>
                  <input
                    id="line-name"
                    className="studio-field"
                    required
                    minLength={2}
                    value={lineName}
                    onChange={(event) => setLineName(event.target.value)}
                  />
                </div>
                <div>
                  <label className="studio-label" htmlFor="line-tag">
                    Tag
                  </label>
                  <input
                    id="line-tag"
                    className="studio-field"
                    value={lineTag}
                    placeholder="Tag (optional)"
                    onChange={(event) => setLineTag(event.target.value)}
                  />
                </div>
                <div>
                  <label className="studio-label" htmlFor="line-note">
                    Note
                  </label>
                  <textarea
                    id="line-note"
                    className="studio-area"
                    rows={2}
                    value={lineNote}
                    onChange={(event) => setLineNote(event.target.value)}
                  />
                </div>
              </div>
              <div className="studio-card-save studio-wide-only">
                <button
                  type="button"
                  className={emptyStyles ? "house-primary ol" : "house-primary"}
                  disabled={lineBusy}
                  onClick={() => void saveLine()}
                >
                  {lineBusy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
            <div className="studio-styles">
              <div className="studio-head">
                <h2>Styles</h2>
                {emptyStyles ? null : (
                  <button type="button" className="studio-sm" disabled={lineBusy} onClick={addStyle}>
                    Add style
                  </button>
                )}
              </div>
              {emptyStyles ? (
                <div className="studio-empty">
                  <p>No Styles in this Line yet.</p>
                  <button type="button" className="house-primary" disabled={lineBusy} onClick={addStyle}>
                    Add style
                  </button>
                </div>
              ) : (
                <div>
                  {lineStyles.map((style, index) => (
                    <StudioRow
                      key={style.id}
                      name={style.name}
                      thumb={style.imageSrc}
                      onDragStart={() => {
                        dragId.current = style.id;
                      }}
                      onDrop={() => void dropStyle(style.id, style.collectionId)}
                      onUp={() => void moveStyle(style.id, "up")}
                      onDown={() => void moveStyle(style.id, "down")}
                      upDisabled={index === 0}
                      downDisabled={index === lineStyles.length - 1}
                      onEdit={() => openStyle(style.collectionId, style)}
                      onRemove={() => void removeStyle(style)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="studio-save studio-phone-only">
          <button
            type="button"
            className={emptyStyles ? "house-primary ol" : "house-primary"}
            disabled={lineBusy}
            onClick={() => void saveLine()}
          >
            {lineBusy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="house-manage" data-editor="closed">
      <div className="house-manage-scroll">
        <div className="house-left">
          <form
            id="house-form"
            className="house-details"
            aria-label="House details"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <p className="studio-kicker studio-wide-only">House</p>
            <div className="studio-title-row">
              <h1 className="studio-h1">{house?.name || "House"}</h1>
              {house ? (
                <span className="ops-badge" data-status={house.status}>
                  {queueStatusLabel(house.status)}
                </span>
              ) : null}
            </div>
            <HouseFields name={name} city={city} bio={bio} onName={setName} onCity={setCity} onBio={setBio} />
            <div>
              <label className="studio-label" htmlFor="house-website">
                Website
              </label>
              <input
                id="house-website"
                className="studio-field"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
          </form>
          <div className="house-save">
            <button type="submit" form="house-form" className="house-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
        <section className="house-collections" aria-label="Lines">
          <div className="studio-head">
            <h2>Lines</h2>
            <button type="button" className="studio-sm" onClick={() => openLine()}>
              Add line
            </button>
          </div>
          {collections.length === 0 ? (
            <p className="studio-empty-lines">No Lines yet. Add your first Line.</p>
          ) : (
            <div>
              {collections.map((collection, index) => {
                const count = styles.filter((style) => style.collectionId === collection.id).length;
                return (
                  <StudioRow
                    key={collection.id}
                    name={collection.name}
                    meta={lineStyleMeta(collection.season, count)}
                    onDragStart={() => {
                      dragId.current = collection.id;
                    }}
                    onDrop={() => void dropLine(collection.id)}
                    onUp={() => void moveLine(collection.id, "up")}
                    onDown={() => void moveLine(collection.id, "down")}
                    upDisabled={index === 0}
                    downDisabled={index === collections.length - 1}
                    onEdit={() => openLine(collection)}
                    onRemove={() => void handleRemoveCollection(collection.id)}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
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
  placeholders = false,
}: {
  name: string;
  city: string;
  bio: string;
  onName: (value: string) => void;
  onCity: (value: string) => void;
  onBio: (value: string) => void;
  placeholders?: boolean;
}) {
  return (
    <div className="studio-stack">
      <div>
        <label className="studio-label" htmlFor="house-name">
          House name
        </label>
        <input
          id="house-name"
          className="studio-field"
          required
          minLength={2}
          value={name}
          autoComplete="organization"
          placeholder={placeholders ? "House name" : undefined}
          onChange={(event) => onName(event.target.value)}
        />
      </div>
      <div>
        <label className="studio-label" htmlFor="house-city">
          City
        </label>
        <input
          id="house-city"
          className="studio-field"
          value={city}
          autoComplete="address-level2"
          placeholder={placeholders ? "City" : undefined}
          onChange={(event) => onCity(event.target.value)}
        />
      </div>
      <div>
        <label className="studio-label" htmlFor="house-bio">
          About
        </label>
        <textarea
          id="house-bio"
          className={placeholders ? "studio-area studio-area-apply" : "studio-area"}
          rows={placeholders ? 4 : 2}
          value={bio}
          placeholder={placeholders ? "Short about" : undefined}
          onChange={(event) => onBio(event.target.value)}
        />
      </div>
    </div>
  );
}

function StudioRow({
  name,
  meta,
  thumb,
  upDisabled,
  downDisabled,
  onDragStart,
  onDrop,
  onUp,
  onDown,
  onEdit,
  onRemove,
}: {
  name: string;
  meta?: string;
  thumb?: string;
  upDisabled: boolean;
  downDisabled: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="lrow" onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={onDrop}>
      <div className="lrow-top">
        <span
          className="lrow-grip"
          draggable
          aria-hidden
          onDragStart={onDragStart}
        >
          <IconGrip />
        </span>
        {thumb ? <img className="lrow-thumb" src={thumb} alt="" /> : null}
        <div className="lrow-text">
          <p className="t1">{name}</p>
          {meta ? <p className="t2">{meta}</p> : null}
        </div>
        <button type="button" className="studio-sm studio-edit" aria-label={`Edit ${name}`} onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="lrow-bot">
        <button
          type="button"
          className="studio-sq studio-up"
          aria-label={`Move ${name} up`}
          disabled={upDisabled}
          onClick={onUp}
        >
          <IconUp />
        </button>
        <button
          type="button"
          className="studio-sq studio-down"
          aria-label={`Move ${name} down`}
          disabled={downDisabled}
          onClick={onDown}
        >
          <IconDown />
        </button>
        <span className="lrow-spacer" />
        <button type="button" className="studio-sm studio-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function IconChevron() {
  return (
    <svg className="studio-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.75 5.4 8.15 12l6.6 6.6" />
    </svg>
  );
}

function IconGrip() {
  return (
    <svg className="studio-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="6" r="1.2" />
      <circle cx="15" cy="6" r="1.2" />
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <circle cx="9" cy="18" r="1.2" />
      <circle cx="15" cy="18" r="1.2" />
    </svg>
  );
}

function IconUp() {
  return (
    <svg className="studio-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6.6 14.75 5.4-5.4 5.4 5.4" />
    </svg>
  );
}

function IconDown() {
  return (
    <svg className="studio-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6.6 9.25 5.4 5.4 5.4-5.4" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="studio-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
