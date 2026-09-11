import { cn } from "@/lib/utils";
import { MOODS, type MoodId } from "@/lib/looks/moods";

export type FeedFilter = MoodId | "saved" | "foryou" | null;

type MoodFilterProps = {
  value: FeedFilter;
  onChange: (mood: FeedFilter) => void;
  counts: Record<string, number>;
  variant?: "page" | "overlay";
  showForYou?: boolean;
};

export function MoodFilter({
  value,
  onChange,
  counts,
  variant = "page",
  showForYou = false,
}: MoodFilterProps) {
  // Editorial lane first when Houses is on; All stays as power-user catalog.
  const chips: { id: FeedFilter; label: string; count: number }[] = [];
  if (showForYou) {
    chips.push({ id: "foryou", label: "For you", count: counts.foryou ?? counts.all });
  }
  chips.push({
    id: null,
    label: variant === "overlay" ? "All" : "All styles",
    count: counts.all,
  });
  if ((counts.saved ?? 0) > 0 || value === "saved") {
    chips.push({ id: "saved", label: "Saved", count: counts.saved ?? 0 });
  }
  for (const mood of MOODS) {
    chips.push({
      id: mood.id,
      label: mood.label,
      count: counts[mood.id] ?? 0,
    });
  }

  return (
    <div
      className={cn(
        "chip-scroll overflow-x-auto",
        variant === "page" ? "-mx-4 px-4 sm:mx-0 sm:overflow-visible sm:px-0" : "px-3",
      )}
    >
      <div className={cn("flex w-max gap-2", variant === "page" && "sm:w-auto sm:flex-wrap")}>
        {chips.map((chip) => {
          const selected = value === chip.id;
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(chip.id)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-[background-color,border-color,color] duration-150",
                variant === "overlay" && "h-9 px-3.5 backdrop-blur-md",
                selected
                  ? "border-foreground bg-primary text-primary-foreground"
                  : variant === "overlay"
                    ? "border-card/40 bg-card/90 text-foreground hover:bg-card"
                    : "border-border bg-card text-foreground hover:border-foreground/40",
              )}
            >
              {chip.label}
              <span
                className={cn(
                  "tabular-nums text-xs",
                  selected ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
