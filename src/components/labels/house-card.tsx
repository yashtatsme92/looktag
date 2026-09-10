import { Link } from "@tanstack/react-router";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { moodLabel } from "@/lib/looks/moods";
import { collectionIdsForLabel, type FashionLabel } from "@/lib/labels/model";
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
  const lookList = Array.isArray(looks) ? looks : [];
  const lookCount = Array.isArray(looks) ? looks.length : looks;
  const collectionCount = lookList.length
    ? collectionIdsForLabel(lookList, label).length
    : 0;
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
          {label.city}
          {collectionCount > 0
            ? ` · ${collectionCount} ${collectionCount === 1 ? "collection" : "collections"}`
            : ` · ${lookCount} ${lookCount === 1 ? "look" : "looks"}`}
        </p>
        {label.moods.length > 0 ? (
          <p className="text-xs leading-snug text-muted-foreground">
            {label.moods.map(moodLabel).join(" · ")}
          </p>
        ) : null}
      </div>
    </Link>
  );
}