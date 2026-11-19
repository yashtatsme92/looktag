import { cn } from "@/lib/utils";
import { couldNot } from "@/lib/errors/copy";
import type { OptimisticPhase } from "@/lib/loading/optimistic";

export function SaveStatus({ phase, error }: { phase: OptimisticPhase; error?: string | null }) {
  if (phase === "idle") return null;
  const text = phase === "saving" ? "Saving…" : phase === "saved" ? "Saved" : error || couldNot("save");
  return (
    <span className={cn("save-status", phase === "saved" && "is-saved", phase === "error" && "is-error")} aria-live="polite">
      {text}
    </span>
  );
}
