import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { LookCanvas } from "@/components/looks/look-canvas";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/looks/format";
import { retailerLabel } from "@/lib/looks/retailers";
import type { Look } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

export const STYLE_GUIDE_KEY = "looktag-style-guide-v1";
export const BROWSE_COACH_KEY = "looktag-browse-coach-v1";

const STEPS = [
  {
    kicker: "01",
    title: "A style is a photograph.",
    body: "Someone wore the outfit, took the picture, and marked every piece. You browse the photo — not a catalogue grid.",
  },
  {
    kicker: "02",
    title: "Tap a pin to pick a piece.",
    body: "Each number is a garment. Try it on this look. The name, brand, and shop appear below the photo.",
  },
  {
    kicker: "03",
    title: "Shop opens the item, not the store.",
    body: "The button is the product page — COS, Zalando, Zara, Massimo Dutti. Same piece. Real checkout.",
  },
] as const;

type StyleGuideProps = {
  look: Look;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function writeKey(key: string) {
  try {
    localStorage.setItem(key, "done");
  } catch {
    // private mode
  }
}

export function markStyleGuideDone(options?: { coach?: boolean }) {
  writeKey(STYLE_GUIDE_KEY);
  if (options?.coach !== false) writeKey(BROWSE_COACH_KEY);
}

export function StyleGuide({ look, open, onOpenChange }: StyleGuideProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState(look.tags[0]?.id ?? null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setHost(document.querySelector(".native-main") as HTMLElement | null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSelectedId(look.tags[0]?.id ?? null);
  }, [open, look.id]);

  if (!open || !host) return null;

  const selected = look.tags.find((tag) => tag.id === selectedId) ?? look.tags[0] ?? null;
  const selectedIndex = selected ? look.tags.findIndex((tag) => tag.id === selected.id) : 0;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const showPins = step >= 1;
  const showShop = step >= 2;

  function skip() {
    markStyleGuideDone({ coach: false });
    onOpenChange(false);
  }

  function finish() {
    markStyleGuideDone({ coach: true });
    onOpenChange(false);
  }

  function next() {
    if (last) {
      finish();
      return;
    }
    setStep((n) => n + 1);
  }

  function openLook() {
    markStyleGuideDone({ coach: true });
    onOpenChange(false);
    void navigate({ to: "/looks/$lookId", params: { lookId: look.id } });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="style-guide-title"
      className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex h-14 min-w-0 items-center gap-3">
          <p id="style-guide-title" className="font-display text-xl italic">
            How to browse
          </p>
          <ol className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((item, index) => (
              <li
                key={item.kicker}
                className={cn(
                  "h-1 w-5 rounded-full",
                  index <= step ? "bg-foreground" : "bg-border",
                )}
              />
            ))}
          </ol>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={skip}>
          Skip
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden bg-muted">
          <LookCanvas
            imageSrc={look.imageSrc}
            title={look.title}
            tags={showPins ? look.tags : []}
            selectedId={showPins ? selectedId : null}
            fit="cover"
            className="h-full max-h-none rounded-none aspect-auto"
            onSelect={(id) => {
              if (!id) return;
              setSelectedId(id);
              if (step < 1) setStep(1);
            }}
          />
        </div>

        <aside className="flex max-h-[48%] shrink-0 flex-col border-t border-border bg-background">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase tabular-nums">
              {current.kicker} / 03 · {look.title}
            </p>
            <h2 className="mt-2 font-display text-3xl leading-[0.95] tracking-tight">
              {current.title}
            </h2>
            <p id="style-guide-copy" className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {current.body}
            </p>

            {showPins && selected ? (
              <div className="mt-3 rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-border)]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground tabular-nums">
                    {selectedIndex + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug [overflow-wrap:anywhere]">{selected.name}</p>
                    <p className="mt-0.5 text-sm leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                      {[...new Set([selected.brand, retailerLabel(selected)].filter(Boolean))].join(
                        " · ",
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm tabular-nums">
                    {formatMoney(selected.price, selected.currency)}
                  </p>
                </div>
                {showShop && selected.url ? (
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Shop {retailerLabel(selected)}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Tap another pin on the photo to switch pieces.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                The numbered pins appear on the next step.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2 px-4 pt-1 pb-4">
            <Button type="button" onClick={next}>
              {last ? "Browse styles" : "Continue"}
              <ArrowRight className="size-4" />
            </Button>
            {last ? (
              <Button type="button" variant="outline" onClick={openLook}>
                Open {look.title}
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>,
    host,
  );
}
