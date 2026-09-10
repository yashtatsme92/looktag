const STEPS = [
  {
    n: "01",
    title: "Pick a style",
    copy: "Coats, evening, knit, linen — or start with the look on the page.",
  },
  {
    n: "02",
    title: "Tap a pin",
    copy: "Each number is a garment. The piece appears beside the photo.",
  },
  {
    n: "03",
    title: "Shop the item",
    copy: "The button opens the real product page, not a shop homepage.",
  },
] as const;

export function BrowseLegend() {
  return (
    <ol className="mb-10 hidden gap-6 border-t border-border pt-5 sm:grid sm:grid-cols-3">
      {STEPS.map((step) => (
        <li key={step.n}>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase tabular-nums">
            {step.n}
          </p>
          <p className="mt-2 font-display text-2xl leading-tight">{step.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{step.copy}</p>
        </li>
      ))}
    </ol>
  );
}
