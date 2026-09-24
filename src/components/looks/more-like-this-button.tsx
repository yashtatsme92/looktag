import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useMoreLikeThis } from "@/lib/looks/more-like-this";
import type { Look } from "@/lib/looks/types";
import "@/styles.more-like-this.css";

type Phase = "idle" | "press" | "finding";

type MoreLikeThisButtonProps = {
  look: Pick<Look, "id" | "moods" | "title">;
};

/**
 * Look-detail only control. Press → fill (150ms) → “Finding more like this”
 * → navigate home so the feed reweights in place. No modal.
 */
export function MoreLikeThisButton({ look }: MoreLikeThisButtonProps) {
  const navigate = useNavigate();
  const activate = useMoreLikeThis((s) => s.activate);
  const [phase, setPhase] = useState<Phase>("idle");
  const busyRef = useRef(false);

  function run() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("press");

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pressMs = reduced ? 0 : 150;
    const findMs = reduced ? 120 : 320;

    window.setTimeout(() => {
      setPhase("finding");
      activate(look);
      window.setTimeout(() => {
        void navigate({ to: "/" }).finally(() => {
          busyRef.current = false;
          setPhase("idle");
        });
      }, findMs);
    }, pressMs);
  }

  return (
    <div className="look-mlt-actions">
      <button
        type="button"
        className="look-mlt-btn"
        data-phase={phase}
        data-more-like-this="true"
        aria-busy={phase !== "idle"}
        disabled={phase !== "idle"}
        onClick={run}
      >
        <Sparkles className="size-4" aria-hidden />
        More like this
      </button>
      {phase === "finding" ? (
        <p className="look-mlt-caption w-full" role="status" aria-live="polite">
          Finding more like this
        </p>
      ) : null}
    </div>
  );
}
