import { Link } from "@tanstack/react-router";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import type { FashionLabel } from "@/lib/labels/model";
import type { Look } from "@/lib/looks/types";

export function HouseCard({
  label,
  cover,
  looks: _looks,
}: {
  label: FashionLabel;
  cover?: Look;
  looks: Look[] | number;
}) {
  return (
    <Link
      to="/houses/$labelId"
      params={{ labelId: label.id }}
      className="house-card"
    >
      <div className="house-card-cover">
        {cover?.imageSrc ? (
          <img src={cover.imageSrc} alt="" />
        ) : (
          <span className="house-card-empty" />
        )}
      </div>
      <div className="house-card-copy">
        <p className="house-card-name">{label.name}</p>
        {label.scouted ? <ScoutedMark /> : null}
      </div>
    </Link>
  );
}
