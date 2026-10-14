import { useEffect, useMemo, useRef } from "react";
import type { Look } from "../looks/types.ts";
import { currentEchoSession, rankEcho, type EchoSession } from "./echo.ts";

/**
 * The one Echo lane for every surface. The session is read once per anchor and the first `limit`
 * looks on screen stay put when inputs change, so the lane never reorders under the shopper (Q22).
 */
export function useEchoLane(
  anchor: Look | undefined,
  looks: readonly Look[],
  forYou: readonly Look[],
  { enabled = true, limit = 1 }: { enabled?: boolean; limit?: number } = {},
): Look[] {
  const seed = enabled ? anchor?.id : undefined;
  const frozen = useRef<{ id: string; session: EchoSession; shown: string[] } | null>(null);
  if (!seed) frozen.current = null;
  else if (frozen.current?.id !== seed) frozen.current = { id: seed, session: currentEchoSession(), shown: [] };

  const lane = useMemo(() => {
    if (!anchor || !seed || !frozen.current) return [];
    return rankEcho(anchor, looks, { forYouOrder: forYou, session: frozen.current.session, onScreen: frozen.current.shown });
  }, [anchor, looks, forYou, seed]);

  useEffect(() => {
    if (frozen.current && seed) frozen.current.shown = lane.slice(0, limit).map((look) => look.id);
  }, [lane, limit, seed]);

  return lane;
}
