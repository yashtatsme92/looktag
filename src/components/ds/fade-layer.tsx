import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Layer = {
  id: string | number;
  children: ReactNode;
  active: boolean;
  enter: boolean;
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
  const [layers, setLayers] = useState<Layer[]>([{ id: stateKey, children, active: true, enter: false }]);

  useEffect(() => {
    if (firstKey.current === stateKey) {
      return;
    }
    firstKey.current = stateKey;
    setLayers((current) => {
      const previous =
        stateKey === "error"
          ? []
          : current
              .filter((layer) => layer.id !== stateKey)
              .map((layer) => ({ ...layer, active: false }));
      return [...previous, { id: stateKey, children: childrenRef.current, active: true, enter: true }];
    });
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setLayers((current) => current.filter((layer) => layer.active || layer.id === stateKey));
    }, 150);
    timers.current.add(timer);
    return () => {
      /* The fade timer still drops the outgoing snapshot. Cancelling it here remounts the skeleton. */
    };
  }, [stateKey]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  return (
    <div className={cn("fade-layer", className)}>
      {layers.map((layer) => (
        <div
          key={String(layer.id)}
          data-active={layer.active ? "true" : "false"}
          data-enter={layer.enter ? "true" : undefined}
        >
          {layer.active ? children : layer.children}
        </div>
      ))}
    </div>
  );
}

/** Tiles start hidden. The next frame sets `.is-in` on the node so the stagger runs without rerendering the list. */
export function useStaggerIn(key: string) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((next: HTMLDivElement | null) => {
    setNode((current) => (current === next ? current : next));
  }, []);
  useEffect(() => {
    const el = node;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.classList.add("is-in");
      return;
    }
    el.classList.remove("is-in");
    const frame = requestAnimationFrame(() => el.classList.add("is-in"));
    return () => cancelAnimationFrame(frame);
  }, [key, node]);
  return ref;
}

/** First paint stays up. Later key changes drop to 0, then fade back over 150ms. */
export function useCrossfade(key: string) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((next: HTMLDivElement | null) => {
    setNode((current) => (current === next ? current : next));
  }, []);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const el = node;
    if (!el) return;
    if (seen.current === null || seen.current === key) {
      seen.current = key;
      el.dataset.swap = "on";
      return;
    }
    seen.current = key;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.dataset.swap = "on";
      return;
    }
    el.dataset.swap = "off";
    const frame = requestAnimationFrame(() => {
      el.dataset.swap = "on";
    });
    return () => cancelAnimationFrame(frame);
  }, [key, node]);
  return ref;
}