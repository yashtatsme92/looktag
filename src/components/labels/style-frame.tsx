import { Link } from "@tanstack/react-router";
import { ImgSlot } from "@/components/ds/img-slot";
import type { FashionStyle } from "@/lib/labels/model";

export function StyleFrame({
  style,
  houseName,
  lineSlug,
}: {
  style: FashionStyle;
  houseName: string;
  lineSlug: string;
}) {
  return (
    <Link
      to="/houses/$labelId/$collectionId/$styleId"
      params={{ labelId: style.labelId, collectionId: lineSlug, styleId: style.id }}
      className="style-frame"
    >
      <ImgSlot src={style.imageSrc} alt="" still sizes="18rem" />
      <div className="style-frame-copy">
        <p className="style-frame-kicker">House</p>
        <p className="style-frame-name">{style.name}</p>
        <p className="style-frame-house">{houseName}</p>
      </div>
    </Link>
  );
}
