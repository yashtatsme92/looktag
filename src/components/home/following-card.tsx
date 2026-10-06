import { Link } from "@tanstack/react-router";
import type { FollowingHouseCard } from "@/lib/home/engagement";

export function FollowingHousePlate({ card }: { card: FollowingHouseCard }) {
  const kicker = card.kind === "line" ? "House · New line" : "House · New style";
  const params = { labelId: card.houseId, collectionId: card.lineSlug };
  return (
    <article className="echo-plate echo-drop">
      {card.kind === "style" && card.styleId ? (
        <Link
          to="/houses/$labelId/$collectionId/$styleId"
          params={{ ...params, styleId: card.styleId }}
          className="echo-photo"
          aria-label={`${card.title}, ${kicker}`}
        >
          <img src={card.imageSrc} alt="" />
        </Link>
      ) : (
        <Link to="/houses/$labelId/$collectionId" params={params} className="echo-photo" aria-label={`${card.title}, ${kicker}`}>
          <img src={card.imageSrc} alt="" />
        </Link>
      )}
      <div className="echo-meta">
        <p className="echo-kicker">{kicker}</p>
        <h2 className="echo-drop-title">{card.title}</h2>
        <span className="echo-rule" />
        <p className="echo-pieces">{card.houseName}</p>
      </div>
    </article>
  );
}

export function FollowingHouseTile({ card }: { card: FollowingHouseCard }) {
  const kicker = card.kind === "line" ? "House · New line" : "House · New style";
  const params = { labelId: card.houseId, collectionId: card.lineSlug };
  const inner = (
    <>
      <img src={card.imageSrc} alt="" />
      <div className="wide-tile-cap">
        <p className="wide-kicker">{kicker}</p>
        <h3>{card.title}</h3>
        <p>{card.houseName}</p>
      </div>
    </>
  );
  if (card.kind === "style" && card.styleId) {
    return (
      <Link
        to="/houses/$labelId/$collectionId/$styleId"
        params={{ ...params, styleId: card.styleId }}
        className="wide-tile following-house"
        aria-label={`${card.title}, ${kicker}`}
      >
        {inner}
      </Link>
    );
  }
  return (
    <Link to="/houses/$labelId/$collectionId" params={params} className="wide-tile following-house" aria-label={`${card.title}, ${kicker}`}>
      {inner}
    </Link>
  );
}
