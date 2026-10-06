import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FEED_LESS_KEY, readStoredIds, toggleStoredId, writeStoredIds } from "@/lib/home/follows";
import type { Look } from "@/lib/looks/types";

export function ShowLess({
  lookId,
  tone = "photo",
  onChange,
}: {
  lookId: string;
  tone?: "photo" | "paper";
  onChange?: (ids: string[]) => void;
}) {
  const [less, setLess] = useState<string[]>([]);
  useEffect(() => {
    setLess(readStoredIds(FEED_LESS_KEY));
  }, []);
  const on = less.includes(lookId);
  function click() {
    const next = toggleStoredId(less, lookId);
    writeStoredIds(FEED_LESS_KEY, next);
    setLess(next);
    onChange?.(next);
  }
  return (
    <button type="button" className={tone === "paper" ? "echo-less echo-less-ink" : "echo-less"} onClick={click}>
      {on ? "Undo" : "Show less like this"}
    </button>
  );
}

export function BecausePlate({ looks }: { looks: Look[] }) {
  if (looks.length === 0) return null;
  return (
    <article className="echo-plate echo-because" key="because-saved">
      <div className="echo-because-copy">
        <p className="echo-kicker">Because you saved</p>
        <div className="echo-because-row">
          {looks.map((look) => (
            <Link key={look.id} to="/looks/$lookId" params={{ lookId: look.id }} aria-label={look.title || "Look"}>
              <img src={look.imageSrc} alt="" />
              <span>{look.title || "Untitled look"}</span>
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}

export function BecauseRow({ looks }: { looks: Look[] }) {
  if (looks.length === 0) return null;
  return (
    <section className="feed-because" aria-label="Because you saved">
      <p className="house-drop-kicker">Because you saved</p>
      <div className="feed-because-row">
        {looks.map((look) => (
          <Link key={look.id} to="/looks/$lookId" params={{ lookId: look.id }} className="wide-tile">
            <img src={look.imageSrc} alt="" />
            <div className="wide-tile-cap">
              <h3>{look.title || "Untitled look"}</h3>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function useRunIndex(length: number) {
  const [index, setIndex] = useState(0);
  const safe = Math.min(index, Math.max(0, length - 1));
  return {
    index: safe,
    prev: () => setIndex((current) => Math.max(0, current - 1)),
    next: () => setIndex((current) => Math.min(length - 1, current + 1)),
  };
}

export function RunPlate({ title, looks }: { title: string; looks: Look[] }) {
  const { index, prev, next } = useRunIndex(looks.length);
  const look = looks[index];
  const start = useRef(0);
  if (!look) return null;
  function onPointerDown(event: PointerEvent<HTMLElement>) {
    start.current = event.clientX;
  }
  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const dx = event.clientX - start.current;
    if (Math.abs(dx) < 36) return;
    event.stopPropagation();
    if (dx < 0) next();
    else prev();
  }
  return (
    <article className="echo-plate echo-run" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <Link to="/looks/$lookId" params={{ lookId: look.id }} className="echo-photo" aria-label={look.title || "Look"}>
        <img src={look.imageSrc} alt="" />
      </Link>
      <div className="echo-meta">
        <p className="echo-kicker">Run</p>
        <h2 className="echo-drop-title">{title}</h2>
        <span className="echo-rule" />
        <p className="echo-pieces">
          {index + 1} of {looks.length}
        </p>
      </div>
    </article>
  );
}

export function RunRow({ title, looks }: { title: string; looks: Look[] }) {
  const { index, prev, next } = useRunIndex(looks.length);
  const look = looks[index];
  if (!look) return null;
  return (
    <section className="feed-run" aria-label={title}>
      <div>
        <p className="house-drop-kicker">Run</p>
        <h3 className="feed-run-title">{title}</h3>
        <p className="feed-run-count">
          {index + 1} of {looks.length}
        </p>
      </div>
      <Link to="/looks/$lookId" params={{ lookId: look.id }} className="feed-run-photo" aria-label={look.title || "Look"}>
        <img src={look.imageSrc} alt="" />
      </Link>
      <div className="feed-run-nav">
        <button type="button" className="echo-chip-back echo-chip-back-ink" aria-label="Previous" onClick={prev} disabled={index === 0}>
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          className="echo-chip-back echo-chip-back-ink"
          aria-label="Next"
          onClick={next}
          disabled={index === looks.length - 1}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </section>
  );
}
