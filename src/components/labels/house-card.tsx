import { Link } from "@tanstack/react-router";
import type { FashionLabel } from "@/lib/labels/model";

export function HouseCard({ label, coverSrc }: { label: FashionLabel; coverSrc?: string }) {
  return (
    <Link to="/houses/$labelId" params={{ labelId: label.id }} className="house-card" aria-label={label.name}>
      {coverSrc ? (
        <>
          <img src={coverSrc} alt="" />
          <div className="house-card-caption">
            {label.scouted ? (
              <span className="house-card-scout">
                <span className="scouted-dot" /> Scouted
              </span>
            ) : null}
            <p className="house-card-name">{label.name}</p>
          </div>
        </>
      ) : (
        <span className="house-card-mark">{label.name}</span>
      )}
    </Link>
  );
}
