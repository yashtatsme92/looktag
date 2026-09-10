import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { BROWSE_COACH_KEY } from "@/components/home/style-guide";
import { LookCanvas } from "@/components/looks/look-canvas";
import { ShopOffers, priceLabel } from "@/components/looks/shop-offers";
import { Button } from "@/components/ui/button";
import { cheapestOffer, tagOffers } from "@/lib/looks/offers";
import { moodLabel } from "@/lib/looks/moods";
import { retailerLabel } from "@/lib/looks/retailers";
import type { Look } from "@/lib/looks/types";
import { cn } from "@/lib/utils";

type FeaturedLookProps = {
  look: Look;
  showCoach?: boolean;
};

export function FeaturedLook({ look, showCoach = false }: FeaturedLookProps) {
  const [selectedId, setSelectedId] = useState<string | null>(look.tags[0]?.id ?? null);
  const [coach, setCoach] = useState(showCoach);

  useEffect(() => {
    setSelectedId(look.tags[0]?.id ?? null);
  }, [look.id]);

  useEffect(() => {
    setCoach(showCoach);
  }, [showCoach]);

  function dismissCoach() {
    setCoach(false);
    try {
      localStorage.setItem(BROWSE_COACH_KEY, "done");
    } catch {
      // private mode
    }
  }

  function selectPin(id: string | null) {
    if (id) dismissCoach();
    setSelectedId(id);
  }

  const selected = look.tags.find((tag) => tag.id === selectedId) ?? look.tags[0] ?? null;
  const selectedIndex = selected ? look.tags.findIndex((tag) => tag.id === selected.id) : -1;
  const mood = look.moods?.[0];
  const shops = selected ? tagOffers(selected).filter((offer) => offer.url) : [];
  const meta = selected
    ? [
        ...new Set(
          [selected.brand, ...(shops.length ? shops.map((offer) => retailerLabel(offer)) : [retailerLabel(selected)])].filter(
            Boolean,
          ),
        ),
      ].join(" · ")
    : "";
  const price = selected ? priceLabel(selected) : null;

  return (
    <section className="rise-in grid gap-5 md:grid-cols-[minmax(0,1.05fr)_minmax(16rem,20rem)] md:items-start lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,22rem)] lg:gap-6">
      <LookCanvas
        imageSrc={look.imageSrc}
        title={look.title}
        tags={look.tags}
        selectedId={selected?.id ?? null}
        fit="cover"
        onSelect={selectPin}
      />

      <aside className="flex flex-col gap-5 rounded-xl bg-card p-4 shadow-[var(--shadow-border)] sm:p-5 md:sticky md:top-24">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {mood ? moodLabel(mood) : "Featured"} · {look.creator}
          </p>
          <h2 className="mt-2 font-display text-3xl leading-none tracking-tight">{look.title}</h2>
          {look.caption ? <p className="mt-3 text-sm text-muted-foreground">{look.caption}</p> : null}
        </div>

        {coach ? (
          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              How to browse
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Tap a numbered pin on the photo. The piece appears here — then shop the cheapest live
              item page, not the store homepage.
            </p>
            <button
              type="button"
              onClick={dismissCoach}
              className="mt-3 h-11 text-sm font-medium underline-offset-4 hover:underline"
            >
              Got it
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tap a pin on the photo to switch pieces.</p>
        )}

        {selected ? (
          <div className="rounded-lg border border-foreground/80 bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground tabular-nums">
                {selectedIndex + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug [overflow-wrap:anywhere]">{selected.name}</p>
                <p className="mt-0.5 text-sm leading-snug text-muted-foreground [overflow-wrap:anywhere]">{meta}</p>
              </div>
              {price ? (
                <p className="shrink-0 text-sm tabular-nums">
                  {price.from ? <span className="text-muted-foreground">from </span> : null}
                  {price.text}
                </p>
              ) : null}
            </div>
            {cheapestOffer(selected)?.url ? <ShopOffers tag={selected} /> : null}
          </div>
        ) : null}

        {look.tags.length > 1 ? (
          <ol className="flex flex-col gap-1">
            {look.tags.map((tag, index) => {
              const active = tag.id === selected?.id;
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => selectPin(tag.id)}
                    className={cn(
                      "flex h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm transition-colors duration-150",
                      active ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="w-4 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{tag.brand}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}

        <Button asChild variant="outline" className="w-full">
          <Link to="/looks/$lookId" params={{ lookId: look.id }}>
            Open the look
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </aside>
    </section>
  );
}
