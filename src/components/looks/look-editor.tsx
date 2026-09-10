import { useEffect, useRef, useState } from "react";
import { Camera, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Chip, Field } from "@/components/ds";
import { LookCanvas } from "@/components/looks/look-canvas";
import { SuggestDialog } from "@/components/looks/suggest-dialog";
import { TagForm } from "@/components/looks/tag-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { searchPin, suggestPieces, type SuggestedPiece } from "@/lib/ai/suggest";
import { isUnauthorized } from "@/lib/looks/api";
import { getMyHouse, listMyCollections } from "@/lib/labels/api";
import type { FashionCollection } from "@/lib/labels/model";
import { useCatalogStore } from "@/lib/looks/catalog";
import { imageSrcToDataUrl, readLookImage } from "@/lib/looks/image";
import { MOODS } from "@/lib/looks/moods";
import { replaceSystemOffers, tagOffers, wornLink } from "@/lib/looks/offers";
import { isHttpUrl, isProductUrl } from "@/lib/looks/retailers";
import { emptyTag, type Look, type ProductOffer, type ProductTag } from "@/lib/looks/types";
import { useChromeLayout } from "@/lib/pwa/use-wide-layout";
import { cn } from "@/lib/utils";

type LookEditorProps = {
  look: Look;
  onChange: (look: Look) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  onReset?: () => void;
  saveLabel: string;
  mode?: "create" | "edit";
  showCreatorField?: boolean;
};

export function LookEditor({
  look,
  onChange,
  onSave,
  onCancel,
  onReset,
  saveLabel,
  mode = "create",
  showCreatorField,
}: LookEditorProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const focusTimer = useRef(0);
  const lookRef = useRef(look);
  lookRef.current = look;

  const [selectedId, setSelectedId] = useState<string | null>(look.tags[0]?.id ?? null);
  const [findingPieces, setFindingPieces] = useState(false);
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedPiece[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [collections, setCollections] = useState<FashionCollection[]>([]);
  const [captionOpen, setCaptionOpen] = useState(Boolean(look.caption.trim()));
  const [fieldFocus, setFieldFocus] = useState(false);
  const chrome = useChromeLayout();
  const phone = chrome === "phone";
  const searchPayload = useCatalogStore((s) => s.searchPayload);
  const selectedTag = look.tags.find((tag) => tag.id === selectedId) ?? null;

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    let alive = true;
    void getMyHouse()
      .then(async (house) => {
        if (!house || house.status !== "approved") return;
        const rows = await listMyCollections();
        if (alive) setCollections(rows);
      })
      .catch(() => {
        if (alive) setCollections([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedId && look.tags.some((tag) => tag.id === selectedId)) return;
    setSelectedId(look.tags[0]?.id ?? null);
  }, [look.tags, selectedId]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (lookRef.current.imageSrc) return;
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void handleFile(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!selectedId) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const step = event.shiftKey ? 5 : 2;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeTag(selectedId, -step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeTag(selectedId, step, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeTag(selectedId, 0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeTag(selectedId, 0, step);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  function patch(partial: Partial<Look>) {
    onChange({ ...lookRef.current, ...partial, updatedAt: Date.now() });
  }

  async function handleFile(file: File) {
    try {
      const imageSrc = await readLookImage(file);
      patch({ imageSrc });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that photo.");
    }
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await handleFile(file);
  }

  function addTag(x: number, y: number) {
    const tag = emptyTag(x, y);
    setSelectedId(tag.id);
    patch({ tags: [...lookRef.current.tags, tag] });
  }

  function moveTag(id: string, x: number, y: number) {
    patch({
      tags: lookRef.current.tags.map((tag) =>
        tag.id === id ? { ...tag, x: clampPin(x), y: clampPin(y) } : tag,
      ),
    });
  }

  function nudgeTag(id: string, dx: number, dy: number) {
    const tag = lookRef.current.tags.find((item) => item.id === id);
    if (!tag) return;
    moveTag(id, tag.x + dx, tag.y + dy);
  }

  function updateTag(next: Look["tags"][number]) {
    patch({
      tags: lookRef.current.tags.map((tag) => (tag.id === next.id ? next : tag)),
    });
  }

  function removeTag(id: string) {
    const tags = lookRef.current.tags.filter((tag) => tag.id !== id);
    setSelectedId(tags[0]?.id ?? null);
    patch({ tags });
  }

  async function handleFindPieces() {
    if (!look.imageSrc) {
      toast.error("Add a photo first.");
      return;
    }
    setFindingPieces(true);
    try {
      const imageDataUrl = await imageSrcToDataUrl(look.imageSrc);
      const result = await suggestPieces({ data: { imageDataUrl, search: searchPayload() } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.pieces.length === 0) {
        toast.error("Nothing to pin. Try a clearer full-body shot.");
        return;
      }
      setSuggestions(result.pieces);
      setSuggestOpen(true);
    } catch (error) {
      if (isUnauthorized(error)) {
        toast.error("Search did not complete. Try again.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Could not read that photo.");
    } finally {
      setFindingPieces(false);
    }
  }

  async function handleSearchPin(tag: ProductTag) {
    const hint = [tag.brand, tag.name].filter(Boolean).join(" ").trim();
    setSearchingId(tag.id);
    try {
      const imageDataUrl = look.imageSrc ? await imageSrcToDataUrl(look.imageSrc) : undefined;
      if (hint.length < 2 && !imageDataUrl) {
        toast.error("Name the piece — colour and garment — then search.");
        return;
      }
      const result = await searchPin({
        data: {
          x: tag.x,
          y: tag.y,
          hint,
          imageDataUrl,
          search: searchPayload(),
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      updateTag(
        replaceSystemOffers(
          {
            ...tag,
            name: tag.name.trim() ? tag.name : result.name,
            brand: tag.brand.trim() ? tag.brand : result.brand,
          },
          result.offers.map(toOffer),
        ),
      );
      toast.success(
        result.offers.length === 1
          ? "Found 1 live listing"
          : `Found ${result.offers.length} shops. Cheapest is from that search.`,
      );
    } catch (error) {
      if (isUnauthorized(error)) {
        toast.error("Search did not complete. Try again.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Search did not complete.");
    } finally {
      setSearchingId(null);
    }
  }

  function acceptSuggestions(pieces: SuggestedPiece[]) {
    const current = lookRef.current;
    const tags = pieces.map((piece) => {
      const tag = emptyTag(piece.x, piece.y);
      tag.name = piece.name;
      tag.brand = piece.brand;
      tag.offers = piece.offers.map(toOffer);
      return tag;
    });
    const first = tags[0];
    if (first) setSelectedId(first.id);
    patch({ tags: [...current.tags, ...tags] });
    toast.success(tags.length === 1 ? "Pinned 1 piece" : `Pinned ${tags.length} pieces`);
  }

  async function handleSave() {
    if (!look.imageSrc) {
      toast.error("Add a photo before saving.");
      return;
    }
    if (!look.title.trim()) {
      toast.error("Give the look a name.");
      return;
    }
    const links = look.tags.flatMap((tag) => {
      const worn = wornLink(tag)?.url ?? "";
      return [...tagOffers(tag).map((offer) => offer.url), worn].filter(Boolean);
    });
    const broken = links.find((url) => !isHttpUrl(url));
    if (broken) {
      toast.error("Every product link needs to start with https://");
      return;
    }
    const homepage = links.find((url) => !isProductUrl(url));
    if (homepage) {
      toast.error("Paste the product page, not the shop homepage — e.g. a Zalando item link.");
      return;
    }
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }

  const studio = Boolean(look.imageSrc);

  return (
    <div
      className="look-studio"
      data-step={studio ? "pins" : "photo"}
      data-chrome={chrome}
      data-keyboard={fieldFocus ? "open" : "closed"}
      data-hydrated={hydrated ? "true" : "false"}
    >
      {studio ? (
        <div className="look-studio-body mt-1">
          <div className="look-studio-frame">
            <LookCanvas
              imageSrc={look.imageSrc}
              title={look.title}
              tags={look.tags}
              selectedId={selectedId}
              editable
              fit="fill"
              className="look-studio-canvas"
              onSelect={setSelectedId}
              onAddTag={addTag}
              onMoveTag={moveTag}
              onPickImage={() => libraryRef.current?.click()}
            />
            {look.tags.length === 0 ? (
              <p className="look-studio-hint">Tap a piece on the photo to pin it</p>
            ) : (
              <p className="look-studio-hint">Drag a pin to place it</p>
            )}
            <button
              type="button"
              className="look-studio-replace"
              onClick={() => libraryRef.current?.click()}
            >
              Replace
            </button>
          </div>

          <div
            ref={trayRef}
            className="look-studio-tray"
            onFocusCapture={(event) => {
              const el = event.target as HTMLElement;
              if (!el.matches("input, textarea")) return;
              window.clearTimeout(focusTimer.current);
              setFieldFocus(true);
              window.setTimeout(() => {
                el.scrollIntoView({ block: "center", behavior: "smooth" });
              }, 80);
            }}
            onBlurCapture={() => {
              window.clearTimeout(focusTimer.current);
              focusTimer.current = window.setTimeout(() => {
                const active = document.activeElement;
                if (
                  trayRef.current?.contains(active) &&
                  active instanceof HTMLElement &&
                  active.matches("input, textarea")
                ) {
                  return;
                }
                setFieldFocus(false);
              }, 120);
            }}
          >
            {!phone && selectedTag ? (
              <PinNudge
                x={selectedTag.x}
                y={selectedTag.y}
                onNudge={(dx, dy) => nudgeTag(selectedTag.id, dx, dy)}
              />
            ) : null}

            <label className="sr-only" htmlFor="look-title">
              Look title
            </label>
            <Input
              id="look-title"
              className="look-studio-title"
              value={look.title}
              placeholder="Name this look"
              autoComplete="off"
              onChange={(event) => patch({ title: event.target.value })}
            />

            <div className="chip-scroll -mx-1 overflow-x-auto px-1">
              <div className="flex w-max gap-2">
                {MOODS.map((mood) => {
                  const on = look.moods?.includes(mood.id) ?? false;
                  return (
                    <Chip
                      key={mood.id}
                      selected={on}
                      onClick={() => {
                        const current = look.moods ?? [];
                        patch({
                          moods: on ? current.filter((id) => id !== mood.id) : [...current, mood.id],
                        });
                      }}
                    >
                      {mood.label}
                    </Chip>
                  );
                })}
              </div>
            </div>

            {collections.length > 0 ? (
              <div className="chip-scroll -mx-1 overflow-x-auto px-1">
                <div className="flex w-max gap-2">
                  <Chip selected={!look.collectionId} onClick={() => patch({ collectionId: undefined })}>
                    No collection
                  </Chip>
                  {collections.map((collection) => (
                    <Chip
                      key={collection.id}
                      selected={look.collectionId === collection.id}
                      onClick={() => patch({ collectionId: collection.id })}
                    >
                      {collection.name}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}

            {look.tags.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Tap each piece, or find them from the photo.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleFindPieces()}
                  disabled={findingPieces}
                >
                  {findingPieces ? "Reading photo…" : "Find all pieces"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="chip-scroll min-w-0 flex-1 overflow-x-auto">
                    <div className="flex w-max gap-2">
                      {look.tags.map((tag, index) => (
                        <Chip
                          key={tag.id}
                          selected={tag.id === selectedId}
                          onClick={() => setSelectedId(tag.id)}
                        >
                          <span className="tabular-nums opacity-60">{index + 1}</span>
                          {tag.name.trim() || `Piece ${index + 1}`}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleFindPieces()}
                    disabled={findingPieces}
                  >
                    {findingPieces ? "Reading…" : "Find more"}
                  </Button>
                </div>
                {selectedTag ? (
                  <TagForm
                    tag={selectedTag}
                    index={look.tags.findIndex((tag) => tag.id === selectedTag.id)}
                    compact
                    lookSrc={look.imageSrc}
                    onChange={updateTag}
                    onRemove={() => removeTag(selectedTag.id)}
                    onSearch={() => void handleSearchPin(selectedTag)}
                    searching={searchingId === selectedTag.id}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Tap a pin to name it.</p>
                )}
              </div>
            )}

            {look.caption.trim() || captionOpen ? (
              <Field label="Caption" htmlFor="look-caption">
                <Textarea
                  id="look-caption"
                  value={look.caption}
                  placeholder="Camel coat, Saturday market."
                  rows={2}
                  onChange={(event) => patch({ caption: event.target.value })}
                />
              </Field>
            ) : (
              <button
                type="button"
                className="h-11 self-start text-sm text-muted-foreground"
                onClick={() => setCaptionOpen(true)}
              >
                Add a caption
              </button>
            )}
          </div>

          <div className="look-studio-dock">
            {onReset || onCancel ? (
              <button
                type="button"
                className="h-11 shrink-0 px-1 text-sm text-muted-foreground hover:text-foreground"
                onClick={onReset ?? onCancel}
              >
                {onReset ? "Start over" : "Cancel"}
              </button>
            ) : null}
            <Button
              type="button"
              className="look-studio-save"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : saveLabel}
            </Button>
          </div>
        </div>
      ) : (
        <PhotoStep
          dragOver={dragOver}
          onDragOver={setDragOver}
          onFiles={handleFiles}
          onCamera={() => cameraRef.current?.click()}
          onLibrary={() => libraryRef.current?.click()}
          guestHint={mode === "create" && showCreatorField !== false}
        />
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <SuggestDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        pieces={suggestions}
        lookSrc={look.imageSrc}
        onAccept={acceptSuggestions}
      />
    </div>
  );
}

function clampPin(n: number) {
  return Math.min(99, Math.max(1, Math.round(n * 10) / 10));
}

function PinNudge({
  x,
  y,
  onNudge,
}: {
  x: number;
  y: number;
  onNudge: (dx: number, dy: number) => void;
}) {
  return (
    <div className="hidden items-center gap-3 md:flex" data-pin-nudge="true">
      <div className="grid grid-cols-3 gap-1">
        <span />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Move pin up"
          onClick={() => onNudge(0, -2)}
        >
          <ChevronUp className="size-4" />
        </Button>
        <span />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Move pin left"
          onClick={() => onNudge(-2, 0)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Move pin right"
          onClick={() => onNudge(2, 0)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <span />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Move pin down"
          onClick={() => onNudge(0, 2)}
        >
          <ChevronDown className="size-4" />
        </Button>
        <span />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {Math.round(x)}% · {Math.round(y)}%
      </p>
    </div>
  );
}

function PhotoStep({
  dragOver,
  onDragOver,
  onFiles,
  onCamera,
  onLibrary,
  guestHint,
}: {
  dragOver: boolean;
  onDragOver: (over: boolean) => void;
  onFiles: (files: FileList | null) => void | Promise<void>;
  onCamera: () => void;
  onLibrary: () => void;
  guestHint?: boolean;
}) {
  return (
    <div className="look-studio-body">
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center rounded-xl bg-muted px-6 py-10 text-center transition-[box-shadow,background-color] duration-150",
          dragOver && "bg-accent shadow-[var(--shadow-border-hover)]",
        )}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          onDragOver(true);
        }}
        onDragLeave={() => onDragOver(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          onDragOver(false);
          void onFiles(event.dataTransfer.files);
        }}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-card text-foreground shadow-[var(--shadow-border)]">
          <ImagePlus className="size-5" />
        </span>
        <p className="ds-display mt-5 text-display">Add a look photo</p>
        <p className="mt-2 max-w-56 text-sm text-muted-foreground">
          Full-body shot, then pin each piece from the photo.
        </p>
        {guestHint ? (
          <p className="mt-3 text-sm text-muted-foreground">Sign in only when you publish.</p>
        ) : null}
      </div>

      <div className="look-studio-dock">
        <Button type="button" onClick={onCamera}>
          <Camera className="size-4" />
          Take photo
        </Button>
        <Button type="button" variant="outline" onClick={onLibrary}>
          <ImagePlus className="size-4" />
          Choose from library
        </Button>
      </div>
    </div>
  );
}

function toOffer(row: {
  url: string;
  price: string;
  currency: string;
  retailerId: string;
  imageUrl?: string;
}): ProductOffer {
  return {
    id: crypto.randomUUID(),
    url: row.url,
    price: row.price,
    currency: row.currency || "EUR",
    retailerId: row.retailerId,
    imageUrl: row.imageUrl,
  };
}
