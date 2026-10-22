import { useState } from "react";
import { Camera, ChevronLeft, ImagePlus, Plus, ScanSearch, X } from "lucide-react";
import { LookCanvas } from "@/components/looks/look-canvas";
import { CropStage } from "@/components/looks/crop-stage";
import { StyleLinkField } from "@/components/labels/style-pin-note";
import { PieceThumb } from "@/components/looks/piece-thumb";
import { pieceLine } from "@/lib/home/echo";
import { formatCreateUploadError, getCreateUploadPresentation } from "@/lib/looks/create-upload";
import { UploadProgress } from "@/components/ds/upload-progress";
import type { PhoneCreateStepId } from "@/lib/looks/create-steps";
import { detectRetailer, getRetailer, RETAILERS } from "@/lib/looks/retailers";
import type { CropRect } from "@/lib/looks/crop";
import type { Look, ProductTag } from "@/lib/looks/types";
import { useKeyboardDock } from "@/components/looks/use-keyboard-dock";
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
  uploadProgress?: number | null;
  photoError: string | null;
  dragOver: boolean;
  saveLabel: string;
  onStep: (step: PhoneCreateStepId) => void;
  cropBase: CropRect | null;
  cropReady: boolean;
  cropEditing: boolean;
  outsideCropPins: number[] | null;
  onCropReady: (ready: boolean) => void;
  onCropBase: (crop: CropRect) => void;
  onCropChange: (crop: CropRect) => void;
  onUsePhoto: () => void;
  onSkipCrop: () => void;
  onEditCrop: () => void;
  onCancelCrop: () => void;
  discardCropAsk?: boolean;
  onDiscardCrop?: () => void;
  onKeepEditingCrop?: () => void;
  onSaveCrop: () => void;
  onAdjustCrop: () => void;
  onKeepCrop: () => void;
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
  onReset?: () => void;
  onDragOver: (over: boolean) => void;
  onFiles: (files: FileList | null) => void | Promise<void>;
  onCamera: () => void;
  onLibrary: () => void;
};

export function PhoneCreate(props: PhoneCreateProps) {
  const { step } = props;
  useKeyboardDock();
  return (
    <>
      {step === "photo" ? <PhotoEntry {...props} /> : null}
      {step === "crop" ? <CropStep {...props} /> : null}
      {step === "pins" || step === "piece" ? <PinPlate {...props} /> : null}
      {step === "details" ? <DetailsStep {...props} /> : null}
      {step === "publish" || step === "name" ? <ReadyStep {...props} /> : null}
    </>
  );
}

function PhotoEntry({
  look,
  readingPhoto,
  uploadProgress = null,
  photoError,
  dragOver,
  onDragOver,
  onFiles,
  onCamera,
  onLibrary,
  onCancel,
  onReset,
}: PhoneCreateProps) {
  const copy = getCreateUploadPresentation({ phone: true, reading: readingPhoto });
  const errorMessage = formatCreateUploadError(photoError);
  const [discardAsk, setDiscardAsk] = useState(false);
  const unsaved = look.tags.length > 0 || Boolean(look.title.trim());

  return (
    <div className="create-paper">
      <header className="create-paper-bar">
        <button
          type="button"
          className="create-paper-back create-paper-close w-11 justify-center"
          aria-label="Close"
          onClick={() => (unsaved ? setDiscardAsk(true) : onCancel())}
        >
          <X className="size-[18px]" strokeWidth={1.75} />
        </button>
        <span className="create-paper-close-spacer w-11" />
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
          <UploadProgress value={uploadProgress} />
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
      {discardAsk ? (
        <div className="crop-outside-scrim">
          <section
            className="crop-outside-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-discard-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setDiscardAsk(false);
              if (event.key === "Tab") {
                const items = event.currentTarget.querySelectorAll("button");
                const first = items[0];
                const last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h2 id="create-discard-title">Discard this look?</h2>
            <p>Your pins and details will be lost.</p>
            <div className="crop-outside-actions">
              <button type="button" className="create-btn-ghost" autoFocus onClick={() => setDiscardAsk(false)}>
                Keep
              </button>
              <button type="button" className="create-btn-primary" onClick={() => {
                onReset?.();
                onCancel();
              }}>
                Discard
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function PinPlate({
  look,
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
  onStep,
  mode,
}: PhoneCreateProps) {
  const selected = look.tags.find((tag) => tag.id === selectedId) ?? null;
  const hint = suggestNote || "Tap the look to place a pin";

  return (
    <div className="create-plate" data-step={step} data-kb-root>
      <header className="create-plate-bar">
        <button
          type="button"
          className="create-plate-back"
          aria-label="Back"
          onClick={() => {
            if (step === "piece") {
              onStep("pins");
              return;
            }
            onStep(mode === "edit" ? "publish" : "crop");
          }}
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
        crop={look.crop}
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
              Find pieces in photo
            </button>
          </div>
          <div className="create-pin-actions">
            <button type="button" className="create-btn-ghost create-btn-done" onClick={onDonePins}>
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
      <StyleLinkField styleId={tag.styleId} onChange={(styleId) => onChange({ ...tag, styleId })} />
      <div className="create-piece-dock" data-kb-dock>
        <button type="button" className="create-btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
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

function DetailsStep({ look, readingPhoto, onPatch, onStep, onContinueDetails, onEditCrop }: PhoneCreateProps) {
  return (
    <div className="create-paper" data-kb-root>
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
            crop={look.crop}
            fit="fill"
            className="create-plate-canvas"
          />
        </div>
        <button type="button" className="create-btn-ghost" onClick={onEditCrop}>
          Edit crop
        </button>
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
      <div className="create-paper-dock" data-kb-dock>
        <button type="button" className="create-btn-primary" onClick={onContinueDetails} disabled={readingPhoto}>
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
  onEditCrop,
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
          crop={look.crop}
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
        <button type="button" className="create-btn-ghost" onClick={onEditCrop}>
          Edit crop
        </button>
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

function CropStep({
  mode,
  look,
  cropReady,
  readingPhoto,
  cropEditing: cropEditingProp,
  outsideCropPins,
  onStep,
  onCropReady,
  onCropBase,
  onCropChange,
  onUsePhoto,
  onSkipCrop,
  onLibrary,
  onCancelCrop,
  onSaveCrop,
  onAdjustCrop,
  onKeepCrop,
  uploadProgress = null,
  discardCropAsk,
  onDiscardCrop,
  onKeepEditingCrop,
}: PhoneCreateProps) {
  const cropEditing = cropEditingProp || mode === "edit";
  const title = cropEditing ? "Edit crop" : "Crop";
  return (
    <section className="create-crop-step" aria-label={title}>
      <header className="crop-header">
        {cropEditing ? (
          <span />
        ) : (
          <button type="button" className="create-paper-back" onClick={() => onStep("photo")}>
            <ChevronLeft className="size-[18px]" strokeWidth={1.75} />
            Back
          </button>
        )}
        <h1 className="create-paper-title">{title}</h1>
        {!cropEditing ? (
          <button type="button" className="crop-skip" onClick={onSkipCrop} disabled={readingPhoto || !cropReady}>
            Skip
          </button>
        ) : (
          <span />
        )}
      </header>
      <CropStage
        imageSrc={look.imageSrc}
        crop={look.crop}
        onChange={onCropChange}
        onReadyChange={onCropReady}
        onBaseChange={onCropBase}
        tags={look.tags}
        showPins={cropEditing}
      />
      <UploadProgress value={uploadProgress} />
      <div className="crop-actions">
        {cropEditing ? (
          <>
            <button type="button" className="create-btn-ghost crop-cancel" onClick={onCancelCrop}>
              Cancel
            </button>
            <button type="button" className="create-btn-primary crop-use" onClick={onSaveCrop} disabled={readingPhoto || !cropReady}>
              Save crop
            </button>
          </>
        ) : (
          <>
            <button type="button" className="create-btn-ghost crop-change" onClick={onLibrary}>
              Change photo
            </button>
            <button type="button" className="create-btn-primary crop-use" onClick={onUsePhoto} disabled={readingPhoto || !cropReady}>
              Use photo
            </button>
          </>
        )}
      </div>
      {discardCropAsk ? (
        <div className="crop-outside-scrim">
          <section
            className="crop-outside-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-discard-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") onKeepEditingCrop?.();
            }}
          >
            <h2 id="crop-discard-title">Discard crop changes?</h2>
            <p>The crop goes back to what it was before this edit.</p>
            <div className="crop-outside-actions">
              <button type="button" className="create-btn-ghost" autoFocus onClick={onKeepEditingCrop}>
                Keep
              </button>
              <button type="button" className="create-btn-primary" onClick={onDiscardCrop}>
                Discard
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {outsideCropPins?.length ? (
        <div className="crop-outside-scrim">
          <section className="crop-outside-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-outside-title">
            <h2 id="crop-outside-title">{outsideCropPins.length} pieces are outside the crop</h2>
            <p>These pieces will not appear in the crop. You can adjust the crop or keep it as it is.</p>
            <ol>
              {outsideCropPins.map((number) => <li key={number}>Piece {number}</li>)}
            </ol>
            <div className="crop-outside-actions">
              <button type="button" className="create-btn-ghost" onClick={onAdjustCrop}>Adjust</button>
              <button type="button" className="create-btn-primary" onClick={onKeepCrop}>Keep crop</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
