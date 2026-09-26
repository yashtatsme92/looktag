import { Camera, ChevronLeft, ImagePlus, Plus, ScanSearch } from "lucide-react";
import { LookCanvas } from "@/components/looks/look-canvas";
import { PieceThumb } from "@/components/looks/piece-thumb";
import { pieceLine } from "@/lib/home/echo";
import { formatCreateUploadError, getCreateUploadPresentation } from "@/lib/looks/create-upload";
import type { PhoneCreateStepId } from "@/lib/looks/create-steps";
import { detectRetailer, getRetailer, RETAILERS } from "@/lib/looks/retailers";
import type { Look, ProductTag } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

type PhoneCreateProps = {
  look: Look;
  mode: "create" | "edit";
  step: PhoneCreateStepId;
  selectedId: string | null;
  finding: boolean;
  suggestNote: string | null;
  saving: boolean;
  readingPhoto: boolean;
  photoError: string | null;
  dragOver: boolean;
  saveLabel: string;
  onStep: (step: PhoneCreateStepId) => void;
  onPatch: (partial: Partial<Look>) => void;
  onSelect: (id: string | null) => void;
  onAddTag: (x: number, y: number) => void;
  onMoveTag: (id: string, x: number, y: number) => void;
  onUpdateTag: (tag: ProductTag) => void;
  onRemoveTag: (id: string) => void;
  onFind: () => void;
  onAddPin: () => void;
  onDonePins: () => void;
  onContinueDetails: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
  onDragOver: (over: boolean) => void;
  onFiles: (files: FileList | null) => void | Promise<void>;
  onCamera: () => void;
  onLibrary: () => void;
};

export function PhoneCreate(props: PhoneCreateProps) {
  const { step } = props;
  return (
    <>
      {step === "photo" ? <PhotoEntry {...props} /> : null}
      {step === "pins" || step === "piece" ? <PinPlate {...props} /> : null}
      {step === "details" ? <DetailsStep {...props} /> : null}
      {step === "publish" || step === "name" ? <ReadyStep {...props} /> : null}
    </>
  );
}

function PhotoEntry({
  readingPhoto,
  photoError,
  dragOver,
  onDragOver,
  onFiles,
  onCamera,
  onLibrary,
}: PhoneCreateProps) {
  const copy = getCreateUploadPresentation({ phone: true, reading: readingPhoto });
  const errorMessage = formatCreateUploadError(photoError);
  return (
    <div className="create-paper">
      <header className="create-paper-bar">
        <span className="w-11" />
        <h1 className="create-paper-title">Create</h1>
        <span className="w-11" />
      </header>
      <div className="create-entry">
        <div
          className={cn("create-entry-plate", dragOver && "create-entry-plate-over")}
          onDragOver={(event) => {
            if (readingPhoto) return;
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            onDragOver(true);
          }}
          onDragLeave={() => onDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            onDragOver(false);
            if (readingPhoto) return;
            if (!event.dataTransfer.files.length) return;
            void onFiles(event.dataTransfer.files);
          }}
        >
          <span className="create-entry-mark">
            <ImagePlus className="size-7" strokeWidth={1.6} />
          </span>
          <p className="create-entry-title">{copy.title}</p>
          <p className="create-entry-body">{copy.body}</p>
          {errorMessage ? (
            <p className="create-entry-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="create-entry-actions">
            <button type="button" className="create-btn-primary" onClick={onLibrary} disabled={readingPhoto}>
              <ImagePlus className="size-4" />
              {copy.primaryLabel}
            </button>
            <button type="button" className="create-btn-secondary" onClick={onCamera} disabled={readingPhoto}>
              <Camera className="size-4" />
              {copy.secondaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PinPlate({
  look,
  mode,
  step,
  selectedId,
  finding,
  suggestNote,
  onSelect,
  onAddTag,
  onMoveTag,
  onUpdateTag,
  onRemoveTag,
  onFind,
  onAddPin,
  onDonePins,
  onLibrary,
  onCancel,
  onStep,
}: PhoneCreateProps) {
  const selected = look.tags.find((tag) => tag.id === selectedId) ?? null;
  const hint = finding
    ? "Finding…"
    : suggestNote
      ? suggestNote
      : "Tap the look to place a pin";

  return (
    <div className="create-plate">
      <header className="create-plate-bar">
        <button
          type="button"
          className="create-plate-back"
          aria-label="Back"
          onClick={() => (mode === "edit" ? onStep("publish") : onCancel())}
        >
          <ChevronLeft className="size-[18px]" strokeWidth={1.75} />
        </button>
        <p className="create-plate-title">{step === "piece" ? "Piece" : "Pin pieces"}</p>
        <button type="button" className="create-plate-done" onClick={step === "piece" ? () => onStep("pins") : onDonePins}>
          Done
        </button>
      </header>
      <LookCanvas
        imageSrc={look.imageSrc}
        title={look.title}
        tags={look.tags}
        selectedId={selectedId}
        editable
        fit="fill"
        className="create-plate-canvas"
        onSelect={onSelect}
        onAddTag={onAddTag}
        onMoveTag={onMoveTag}
        onPickImage={onLibrary}
        selectOnTap
      />
      {step === "piece" && selected ? (
        <PieceChip
          look={look}
          tag={selected}
          onChange={onUpdateTag}
          onRemove={() => onRemoveTag(selected.id)}
          onDone={() => onStep("pins")}
        />
      ) : (
        <div className="create-pin-dock">
          <p className="create-pin-hint">{hint}</p>
          {suggestNote && !finding ? (
            <p className="create-pin-hint create-pin-hint-quiet">Keep, nudge, or delete — same piece cards</p>
          ) : null}
          <div className="create-pin-find">
            <button type="button" className="create-find" onClick={onFind} disabled={finding}>
              <ScanSearch className="size-4" />
              {finding ? "Finding…" : "Find pieces in photo"}
            </button>
          </div>
          <div className="create-pin-actions">
            <button type="button" className="create-btn-ghost" onClick={onDonePins}>
              Done
            </button>
            <button type="button" className="create-btn-primary create-btn-pin" onClick={onAddPin}>
              <Plus className="size-4" />
              Add pin
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PieceChip({
  look,
  tag,
  onChange,
  onRemove,
  onDone,
}: {
  look: Look;
  tag: ProductTag;
  onChange: (tag: ProductTag) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const retailer = getRetailer(tag.retailerId)?.name || tag.brand;
  return (
    <div className="create-piece" role="dialog" aria-label="Edit piece">
      <div className="create-piece-row">
        <PieceThumb lookSrc={look.imageSrc} x={tag.x} y={tag.y} alt="" size="sm" />
        <div className="create-piece-fields">
          <input
            className="create-piece-name"
            aria-label="Piece name"
            value={tag.name}
            placeholder="Piece name"
            autoComplete="off"
            onChange={(event) => onChange({ ...tag, name: event.target.value })}
          />
          <input
            className="create-piece-retailer"
            aria-label="Retailer"
            value={retailer}
            placeholder="Retailer"
            autoComplete="off"
            onChange={(event) => onChange(applyRetailer(tag, event.target.value))}
          />
        </div>
      </div>
      <input
        className="create-piece-link"
        aria-label="Link"
        placeholder="Link (optional)"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={tag.url}
        onChange={(event) => {
          const url = event.target.value;
          const detected = detectRetailer(url);
          onChange({
            ...tag,
            url,
            retailerId: detected?.id || tag.retailerId,
          });
        }}
      />
      <button type="button" className="create-btn-primary" onClick={onDone}>
        Done
      </button>
      <button type="button" className="create-piece-remove" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function applyRetailer(tag: ProductTag, text: string): ProductTag {
  const match = RETAILERS.find((row) => row.name.toLowerCase() === text.trim().toLowerCase());
  if (match) return { ...tag, retailerId: match.id };
  return { ...tag, retailerId: "", brand: text };
}

function DetailsStep({ look, onPatch, onStep, onContinueDetails }: PhoneCreateProps) {
  return (
    <div className="create-paper">
      <header className="create-paper-bar">
        <button type="button" className="create-paper-back" onClick={() => onStep("pins")}>
          <ChevronLeft className="size-[18px]" strokeWidth={1.75} />
          Back
        </button>
        <h1 className="create-paper-title">Details</h1>
        <span className="w-14" />
      </header>
      <div className="create-details">
        <div className="create-details-photo">
          <LookCanvas
            imageSrc={look.imageSrc}
            title={look.title}
            tags={look.tags}
            fit="fill"
            className="create-plate-canvas"
          />
        </div>
        <label className="create-kicker" htmlFor="create-title">
          Title
        </label>
        <input
          id="create-title"
          className="create-field"
          value={look.title}
          placeholder="Numbered cut"
          autoComplete="off"
          autoCapitalize="sentences"
          onChange={(event) => onPatch({ title: event.target.value })}
        />
        <label className="create-kicker" htmlFor="create-caption">
          Caption <span className="create-kicker-optional">(optional)</span>
        </label>
        <textarea
          id="create-caption"
          className="create-field create-caption"
          value={look.caption}
          placeholder="Press linen for Friday."
          rows={3}
          onChange={(event) => onPatch({ caption: event.target.value })}
        />
      </div>
      <div className="create-paper-dock">
        <button type="button" className="create-btn-primary" onClick={onContinueDetails}>
          Continue
        </button>
      </div>
    </div>
  );
}

function ReadyStep({
  look,
  mode,
  saving,
  saveLabel,
  onStep,
  onPublish,
  onSaveDraft,
  onCancel,
}: PhoneCreateProps) {
  const pieces = pieceLine(look);
  const who = look.creator?.trim() ?? "";
  const kicker = pieces && who ? `${pieces} · ${who}` : pieces || who || "No pieces yet";
  const editing = mode === "edit";
  return (
    <div className="create-paper">
      <header className="create-paper-bar">
        <button type="button" className="create-paper-back" onClick={() => (editing ? onCancel() : onStep("details"))}>
          <ChevronLeft className="size-[18px]" strokeWidth={1.75} />
          Back
        </button>
        <h1 className="create-paper-title">{editing ? "Edit look" : "Ready"}</h1>
        <span className="w-14" />
      </header>
      <div className="create-ready-photo">
        <LookCanvas
          imageSrc={look.imageSrc}
          title={look.title}
          tags={look.tags}
          fit="fill"
          className="create-plate-canvas"
        />
        <button type="button" className="create-ready-open" aria-label="Pin pieces" onClick={() => onStep("pins")} />
        <div className="create-hangtag">
          <p className="create-hangtag-kicker">{kicker}</p>
          <p className="create-hangtag-title">{look.title.trim() || "Untitled"}</p>
        </div>
      </div>
      <div className="create-paper-dock">
        <button type="button" className="create-btn-primary" onClick={onPublish} disabled={saving}>
          {saving ? "Saving…" : editing ? saveLabel : "Publish"}
        </button>
        {editing ? null : (
          <button type="button" className="create-btn-ghost create-btn-draft" onClick={onSaveDraft}>
            Save draft
          </button>
        )}
      </div>
    </div>
  );
}
