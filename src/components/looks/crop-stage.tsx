import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Minus, Plus } from "lucide-react";
import {
  centeredCrop,
  panCrop,
  zoomCrop,
  zoomMaxForCrop,
  type CropRect,
} from "@/lib/looks/crop";
import type { ProductTag } from "@/lib/looks/types";

type CropStageProps = {
  imageSrc: string;
  crop?: CropRect;
  onChange: (crop: CropRect) => void;
  onReadyChange: (ready: boolean) => void;
  onBaseChange: (crop: CropRect) => void;
  tags?: ProductTag[];
  showPins?: boolean;
};

type Point = { x: number; y: number };

export function CropStage({
  imageSrc,
  crop: initialCrop,
  onChange,
  onReadyChange,
  onBaseChange,
  tags = [],
  showPins = false,
}: CropStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    | { kind: "pan"; point: Point; crop: CropRect }
    | { kind: "pinch"; distance: number; zoom: number }
    | null
  >(null);
  const onReadyRef = useRef(onReadyChange);
  onReadyRef.current = onReadyChange;
  const initialCropRef = useRef(initialCrop);
  initialCropRef.current = initialCrop;
  const baseRef = useRef<CropRect | null>(initialCrop ?? null);
  const liveCrop = useRef<CropRect | null>(initialCrop ?? null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [visible, setVisible] = useState<CropRect | null>(initialCrop ?? null);
  const [zoom, setZoom] = useState(1);
  const [frameSize, setFrameSize] = useState({ w: 1, h: 1 });
  const [stageSize, setStageSize] = useState({ w: 1, h: 1 });
  const maxZoom = size && baseRef.current ? zoomMaxForCrop(size.w, size.h, baseRef.current) : 1;
  const ready = Boolean(size && visible);

  useLayoutEffect(() => {
    setSize(null);
    setVisible(null);
    setZoom(1);
    baseRef.current = initialCropRef.current ?? null;
    liveCrop.current = initialCropRef.current ?? null;
    onReadyRef.current(false);
  }, [imageSrc]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const readSize = () => {
      const stageRect = stage.getBoundingClientRect();
      setStageSize({ w: stageRect.width || 1, h: stageRect.height || 1 });
      const frame = frameRef.current;
      if (frame) {
        setFrameSize({ w: frame.offsetWidth || 1, h: frame.offsetHeight || 1 });
      }
    };
    readSize();
    const observer = new ResizeObserver(readSize);
    observer.observe(stage);
    if (frameRef.current) observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [ready]);

  function publish(next: CropRect) {
    liveCrop.current = next;
    setVisible(next);
    onChange(next);
  }

  function setZoomValue(value: number) {
    if (!size || !baseRef.current) return;
    const nextZoom = Math.min(maxZoom, Math.max(1, value >= maxZoom ? maxZoom : Math.round(value * 10) / 10));
    setZoom(nextZoom);
    publish(zoomCrop(baseRef.current, nextZoom));
  }

  function pan(dx: number, dy: number, from: CropRect = liveCrop.current ?? visible ?? baseRef.current ?? centeredCrop(1, 1)) {
    const next = panCrop(from, dx, dy);
    publish(next);
    return next;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!ready) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      gesture.current = { kind: "pinch", distance: distance(a, b), zoom };
    } else {
      gesture.current = {
        kind: "pan",
        point: { x: event.clientX, y: event.clientY },
        crop: liveCrop.current ?? visible ?? baseRef.current ?? centeredCrop(1, 1),
      };
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b || gesture.current?.kind !== "pinch") return;
      setZoomValue(gesture.current.zoom * (distance(a, b) / gesture.current.distance));
      return;
    }
    if (gesture.current?.kind !== "pan") return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = pan(
      -((event.clientX - gesture.current.point.x) / rect.width) * gesture.current.crop.w,
      -((event.clientY - gesture.current.point.y) / rect.height) * gesture.current.crop.h,
      gesture.current.crop,
    );
    gesture.current = {
      kind: "pan",
      point: { x: event.clientX, y: event.clientY },
      crop: next,
    };
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
    const point = pointers.current.values().next().value as Point | undefined;
    const current = liveCrop.current ?? visible;
    if (point && current) gesture.current = { kind: "pan", point, crop: current };
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!ready || maxZoom <= 1) return;
    event.preventDefault();
    setZoomValue(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }

  function onFrameKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ready) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoomValue(zoom + 0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      setZoomValue(zoom - 0.1);
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const amount = event.shiftKey ? 48 : 8;
      const dx = event.key === "ArrowLeft" ? amount : event.key === "ArrowRight" ? -amount : 0;
      const dy = event.key === "ArrowUp" ? amount : event.key === "ArrowDown" ? -amount : 0;
      pan(
        (dx / (frameSize.w * pinScale)) * (visible?.w ?? 1),
        (dy / (frameSize.h * pinScale)) * (visible?.h ?? 1),
      );
    }
  }

  const imageStyle =
    visible && size
      ? {
          width: `${(100 / visible.w).toFixed(5)}%`,
          height: `${(100 / visible.h).toFixed(5)}%`,
          left: `${((-visible.x / visible.w) * 100).toFixed(5)}%`,
          top: `${((-visible.y / visible.h) * 100).toFixed(5)}%`,
        }
      : undefined;
  const pinPositions = showPins && visible
    ? tags.map((tag) => ({
        x: ((tag.x / 100 - visible.x) / visible.w) * 100,
        y: ((tag.y / 100 - visible.y) / visible.h) * 100,
      }))
    : [];
  const horizontalSpan = pinPositions.length
    ? Math.max(1, ...pinPositions.map((point) => point.x)) -
      Math.min(0, ...pinPositions.map((point) => point.x))
    : 1;
  const verticalSpan = pinPositions.length
    ? Math.max(1, ...pinPositions.map((point) => point.y)) -
      Math.min(0, ...pinPositions.map((point) => point.y))
    : 1;
  const pinScale = pinPositions.length
    ? Math.min(
        1,
        Math.max(0.01, (stageSize.w - 60) / (frameSize.w * horizontalSpan)),
        Math.max(0.01, (stageSize.h - 188) / (frameSize.h * verticalSpan)),
      )
    : 1;
  const pinMarkerScale = 1 / pinScale;

  return (
    <div ref={stageRef} className="crop-stage" aria-busy={!ready}>
      <img
        className="crop-stage-underlay"
        src={imageSrc}
        alt=""
        aria-hidden
        style={{ visibility: ready ? "visible" : "hidden" }}
      />
      {ready ? (
        <div
          ref={frameRef}
          className="crop-frame"
          style={showPins ? { transform: `scale(${pinScale})` } : undefined}
          role="group"
          aria-label="Crop area, use arrow keys to move"
          tabIndex={0}
          onKeyDown={onFrameKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onWheel={onWheel}
        >
          <div className="crop-frame-window">
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className={`crop-frame-image${ready ? " is-loaded" : ""}`}
              style={imageStyle}
            />
            <span className="crop-frame-grid" aria-hidden />
            <span className="crop-frame-ticks" aria-hidden />
          </div>
          {showPins
            ? tags.map((tag, index) => {
                const x = ((tag.x / 100 - (visible?.x ?? 0)) / (visible?.w ?? 1)) * 100;
                const y = ((tag.y / 100 - (visible?.y ?? 0)) / (visible?.h ?? 1)) * 100;
                const outside =
                  tag.x / 100 < (visible?.x ?? 0) ||
                  tag.x / 100 > (visible?.x ?? 0) + (visible?.w ?? 1) ||
                  tag.y / 100 < (visible?.y ?? 0) ||
                  tag.y / 100 > (visible?.y ?? 0) + (visible?.h ?? 1);
                return (
                  <span
                    key={tag.id}
                    className="crop-pin-marker"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      opacity: outside ? 0.55 : 1,
                      width: `${1.75 * pinMarkerScale}rem`,
                      height: `${1.75 * pinMarkerScale}rem`,
                      borderWidth: `${pinMarkerScale}px`,
                      fontSize: `${0.75 * pinMarkerScale}rem`,
                    }}
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                );
              })
            : null}
          <span className="crop-frame-shade" aria-hidden />
        </div>
      ) : (
        <div className="crop-stage-loading" role="status" aria-live="polite">
            <span className="crop-stage-skeleton" />
            Loading photo
        </div>
      )}
      <img
        className="crop-image-loader"
        src={imageSrc}
        alt=""
        aria-hidden
        onLoad={(event) => {
          const image = event.currentTarget;
          if (!image.naturalWidth || !image.naturalHeight) return;
          const nextSize = { w: image.naturalWidth, h: image.naturalHeight };
          const base = initialCrop ?? centeredCrop(nextSize.w, nextSize.h);
          setSize(nextSize);
          setFrameSize((current) => {
            const rect = frameRef.current?.getBoundingClientRect();
            return rect?.width && rect.height ? { w: rect.width, h: rect.height } : current;
          });
          baseRef.current = base;
          setVisible(base);
          onBaseChange(base);
          onReadyChange(true);
        }}
      />
      {ready ? (
        <div className="crop-controls">
          <button
            type="button"
            className="crop-zoom-button"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoomValue(zoom - 0.1)}
          >
            <Minus aria-hidden />
          </button>
          <input
            className="crop-zoom-slider"
            type="range"
            min={1}
            max={maxZoom}
            step={0.1}
            value={zoom}
            aria-label="Zoom"
            aria-valuetext={`Zoom, ${zoom.toFixed(1).replace(/\.0$/, "")}×`}
            disabled={maxZoom <= 1}
            onChange={(event) => setZoomValue(Number(event.currentTarget.value))}
          />
          <span className="crop-zoom-value" aria-live="polite">
            {zoom.toFixed(1).replace(/\.0$/, "")}×
          </span>
          <button
            type="button"
            className="crop-zoom-button"
            aria-label="Zoom in"
            disabled={zoom >= maxZoom || maxZoom <= 1}
            onClick={() => setZoomValue(zoom + 0.1)}
          >
            <Plus aria-hidden />
          </button>
          <button
            type="button"
            className="crop-reset"
            aria-label="Reset crop"
            disabled={
              zoom === 1 &&
              visible?.x === baseRef.current?.x &&
              visible?.y === baseRef.current?.y &&
              visible?.w === baseRef.current?.w &&
              visible?.h === baseRef.current?.h
            }
            onClick={() => {
              setZoom(1);
              if (baseRef.current) publish(baseRef.current);
            }}
          >
            Reset
          </button>
        </div>
      ) : null}
      {size && Math.min(size.w, size.h) < 1080 ? (
        <p className="crop-small-note">This photo is small and may look soft.</p>
      ) : null}
      <p className="crop-instructions crop-phone-hint">Drag to move · Pinch or scroll to zoom</p>
      <p className="crop-instructions crop-desktop-hint">
        Arrow keys move 8px (Shift 48px) · + / − zoom
      </p>
    </div>
  );
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
