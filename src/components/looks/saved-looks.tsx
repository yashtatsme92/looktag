import { useLayoutEffect } from "react";
import { Link } from "@tanstack/react-router";
import { LookCard } from "@/components/looks/look-card";
import { useSavedLooks } from "@/lib/looks/saved";
import { useLooksStore } from "@/lib/looks/store";
import type { Look } from "@/lib/looks/types";

function useSavedLookItems(): Look[] {
  const hydrate = useSavedLooks((s) => s.hydrate);
  const ids = useSavedLooks((s) => s.ids);
  const looks = useLooksStore((s) => s.looks);

  useLayoutEffect(() => {
    hydrate();
  }, [hydrate]);

  return ids
    .map((id) => looks.find((look) => look.id === id))
    .filter((look): look is Look => Boolean(look));
}

export function SavedLooks({ variant }: { variant: "rail" | "grid" }) {
  const saved = useSavedLookItems();

  if (variant === "rail") {
    return (
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl leading-none">Saved</h2>
          <p className="text-xs tabular-nums text-muted-foreground">{saved.length}</p>
        </div>
        {saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tap the bookmark on a look to keep it here.
          </p>
        ) : (
          <ul className="chip-scroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {saved.map((look) => (
              <li key={look.id} className="w-28 shrink-0">
                <Link
                  to="/looks/$lookId"
                  params={{ lookId: look.id }}
                  className="block"
                >
                  {look.imageSrc ? (
                    <img
                      src={look.imageSrc}
                      alt={look.title}
                      className="aspect-[2/3] w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                      No photo
                    </div>
                  )}
                  <p className="mt-1.5 text-sm leading-snug [overflow-wrap:anywhere]">{look.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-2xl leading-none">Saved</h2>
      {saved.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tap the bookmark on a look to keep it here.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {saved.map((look) => (
            <LookCard key={look.id} look={look} />
          ))}
        </div>
      )}
    </section>
  );
}
