import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { formatMoney, lookCurrency, lookTotal } from "@/lib/looks/format";
import { tagOffers } from "@/lib/looks/offers";
import { retailerLabel } from "@/lib/looks/retailers";
import type { Look } from "@/lib/looks/types";

export function LookCard({ look }: { look: Look }) {
  const total = lookTotal(look.tags);
  const currency = lookCurrency(look.tags);
  const retailers = [
    ...new Set(
      look.tags.flatMap((tag) => {
        const offers = tagOffers(tag);
        return (offers.length ? offers : [tag]).map((item) => retailerLabel(item));
      }),
    ),
  ].slice(0, 3);

  return (
    <Link
      to="/looks/$lookId"
      params={{ lookId: look.id }}
      className="group ds-surface ds-surface-hover block p-2"
    >
      <div className="overflow-hidden rounded-lg bg-muted">
        {look.imageSrc ? (
          <img
            src={look.imageSrc}
            alt={look.title}
            className="aspect-[2/3] w-full object-cover object-[center_18%] transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex aspect-[2/3] items-center justify-center text-sm text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 px-2 pt-3 pb-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="ds-card-title min-w-0 flex-1">{look.title || "Untitled look"}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {look.tags.length} {look.tags.length === 1 ? "item" : "items"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{look.creator}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {retailers.map((name) => (
            <Badge key={name} variant="muted">
              {name}
            </Badge>
          ))}
          {total > 0 ? (
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {formatMoney(String(total), currency)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
