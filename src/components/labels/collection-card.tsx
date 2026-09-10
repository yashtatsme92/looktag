import { Link } from "@tanstack/react-router";
import type { FashionCollection } from "@/lib/labels/model";
import type { Look } from "@/lib/looks/types";

export function CollectionCard({
  labelId,
  collection,
  cover,
  looks,
}: {
  labelId: string;
  collection: FashionCollection;
  cover?: Look;
  looks: number;
}) {
  return (
    <Link
      to="/houses/$labelId/$collectionId"
      params={{ labelId, collectionId: collection.slug }}
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
        {collection.season ? <p className="ds-kicker">{collection.season}</p> : null}
        <p className="ds-card-title">{collection.name}</p>
        <p className="text-xs leading-snug text-muted-foreground">
          {looks} {looks === 1 ? "look" : "looks"}
        </p>
      </div>
    </Link>
  );
}
