import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Layer = {
  id: string | number;
  children: ReactNode;
  active: boolean;
};

/** Active layer reads live children. Inactive layers are 150ms snapshots and are not refreshed. */

export function FadeLayer({
  stateKey,
  children,
  className,
}: {
  stateKey: string | number;
  children: ReactNode;
  className?: string;
}) {
  const firstKey = useRef(stateKey);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [layers, setLayers] = useState<Layer[]>([{ id: stateKey, children, active: true }]);

  useEffect(() => {
    if (firstKey.current === stateKey) {
      return;
    }
    firstKey.current = stateKey;
    setLayers((current) => [
      ...current
        .filter((layer) => layer.id !== stateKey)
        .map((layer) => ({ ...layer, active: false })),
      { id: stateKey, children: childrenRef.current, active: false },
    ]);
    const frame = requestAnimationFrame(() => {
      setLayers((current) =>
        current.map((layer) => ({ ...layer, active: layer.id === stateKey })),
      );
    });
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setLayers((current) => current.filter((layer) => layer.active));
    }, 150);
    timers.current.add(timer);
    return () => cancelAnimationFrame(frame);
  }, [stateKey]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return (
    <div className={cn("fade-layer", className)}>
      {layers.map((layer, index) => (
        <div key={`${String(layer.id)}-${index}`} data-active={layer.active ? "true" : "false"}>
          {layer.active ? children : layer.children}
        </div>
      ))}
    </div>
  );
}

/** Tiles start hidden. The next frame sets `.is-in` so the stagger transition runs. */
export function useStaggerIn(key: string) {
  const [shown, setShown] = useState(key);
  const [on, setOn] = useState(false);
  if (key !== shown) {
    setShown(key);
    setOn(false);
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(frame);
  }, [shown]);
  return on;
}

/** First paint stays up. Later key changes drop to 0, then fade back over 150ms. */
export function useCrossfade(key: string) {
  const [shown, setShown] = useState(key);
  const [on, setOn] = useState(true);
  if (key !== shown) {
    setShown(key);
    setOn(false);
  }
  useEffect(() => {
    if (on) return;
    const frame = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(frame);
  }, [on, shown]);
  return on ? "on" : "off";
}