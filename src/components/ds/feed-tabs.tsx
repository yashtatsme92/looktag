import { useLayoutEffect, useRef, useState } from "react";

export function FeedTabs({
  mode,
  unseen,
  variant,
  onFeed,
  onFollowing,
}: {
  mode: "feed" | "following";
  unseen: number;
  variant: "echo" | "wide";
  onFeed: () => void;
  onFollowing: () => void;
}) {
  const feedRef = useRef<HTMLButtonElement>(null);
  const followRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState({ x: 0, width: 0 });

  useLayoutEffect(() => {
    const button = mode === "following" ? followRef.current : feedRef.current;
    const nav = button?.parentElement;
    if (!button || !nav) return;
    const measure = () => {
      const navBox = nav.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      const inset = variant === "echo" ? 10 : 0;
      const x = buttonBox.left - navBox.left + inset;
      const width = Math.max(0, buttonBox.width - inset * 2);
      setBox((current) => {
        if (Math.abs(current.x - x) < 0.5 && Math.abs(current.width - width) < 0.5) return current;
        return { x, width };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(button);
    return () => observer.disconnect();
  }, [mode, unseen, variant]);

  return (
    <nav className={variant === "echo" ? "echo-tabs" : "wide-tabs"} aria-label="Looks">
      {box.width > 0 ? (
        <span className="tab-indicator" style={{ transform: `translate3d(${box.x}px, 0, 0)`, width: box.width }} />
      ) : null}
      <button ref={feedRef} type="button" aria-current={mode === "feed" ? "page" : undefined} onClick={onFeed}>
        For you
      </button>
      <button
        ref={followRef}
        type="button"
        aria-current={mode === "following" ? "page" : undefined}
        aria-label={unseen > 0 ? `Following, ${unseen} new` : "Following"}
        onClick={onFollowing}
      >
        Following
        {unseen > 0 && mode !== "following" ? <span className="echo-dot" aria-hidden /> : null}
      </button>
    </nav>
  );
}
