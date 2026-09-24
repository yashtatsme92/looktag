import type { ChromeLayout } from "../pwa/layout.ts";
import { funnelUserState, type FunnelUserState } from "./funnel-model.ts";

type PinAddedPayload = {
  chrome?: ChromeLayout;
  count?: number;
  lookId?: string;
  source: "tap" | "suggest";
  userState?: FunnelUserState;
};

type ShopResultPayload = {
  chrome?: ChromeLayout;
  lookId?: string;
  offerCount: number;
  retailerCount: number;
  source: "pin_search";
  tagId?: string;
  userState?: FunnelUserState;
};

export function recordManualPinAdded(
  recordPinAdded: (payload: PinAddedPayload) => void,
  input: { chrome: ChromeLayout; lookId: string; userId: string },
) {
  recordPinAdded({
    chrome: input.chrome,
    count: 1,
    lookId: input.lookId,
    source: "tap",
    userState: funnelUserState(input.userId),
  });
}

export function recordSuggestedPinsAdded(
  recordPinAdded: (payload: PinAddedPayload) => void,
  input: { chrome: ChromeLayout; count: number; lookId: string; userId: string },
) {
  recordPinAdded({
    chrome: input.chrome,
    count: input.count,
    lookId: input.lookId,
    source: "suggest",
    userState: funnelUserState(input.userId),
  });
}

export function recordPinSearchResolved(
  recordShopResultShown: (payload: ShopResultPayload) => void,
  input: {
    chrome: ChromeLayout;
    lookId: string;
    offers: Array<{ retailerId: string }>;
    tagId: string;
    userId: string;
  },
) {
  recordShopResultShown({
    chrome: input.chrome,
    lookId: input.lookId,
    offerCount: input.offers.length,
    retailerCount: new Set(input.offers.map((offer) => offer.retailerId).filter(Boolean)).size,
    source: "pin_search",
    tagId: input.tagId,
    userState: funnelUserState(input.userId),
  });
}

