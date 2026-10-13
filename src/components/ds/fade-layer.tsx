import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Layer = {
  id: string | number;
  children: ReactNode;
  active: boolean;
};

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
      ...current.map((layer) => ({ ...layer, active: false })),
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
