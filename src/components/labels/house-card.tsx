import { Link } from "@tanstack/react-router";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import type { FashionLabel } from "@/lib/labels/model";
import type { Look } from "@/lib/looks/types";

export function HouseCard({
  label,
  cover,
  looks,
}: {
  label: FashionLabel;
  cover?: Look;
  looks: Look[] | number;
}) {
  const lookCount = Array.isArray(looks) ? looks.length : looks;
  return (
    <Link
      to="/houses/$labelId"
      params={{ labelId: label.id }}
      className="ds-surface ds-surface-hover block p-2"
    >
      <div className="overflow-hidden rounded-lg bg-muted">
        {cover?.imageSrc ? (
          <img
            src={cover.imageSrc}
            alt=""
            className="aspect-[2/3] w-full object-cover object-[center_18%]"
          />
        ) : (
          <div className="aspect-[2/3] bg-muted" />
        )}
      </div>
      <div className="flex flex-col gap-1.5 px-2 pt-3 pb-2">
        <p className="ds-card-title">{label.name}</p>
        {label.scouted ? <ScoutedMark /> : null}
        <p className="text-xs leading-snug text-muted-foreground">
          {[label.city, `${lookCount} ${lookCount === 1 ? "look" : "looks"}`].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
