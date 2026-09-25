import type { ChromeLayout } from "../pwa/layout.ts";

export type FunnelUserState = "guest" | "signed_in";

export type FunnelAttrs = Record<string, string | number | boolean | undefined>;

type FunnelContext = {
  chrome?: ChromeLayout;
  lookId?: string;
  userState?: FunnelUserState;
};

function baseAttrs(context: FunnelContext): FunnelAttrs {
  return {
    "looktag.ui.chrome": context.chrome,
    "looktag.look.id": context.lookId,
    "looktag.funnel.user_state": context.userState,
  };
}

export function funnelUserState(value: string | boolean | null | undefined): FunnelUserState {
  if (typeof value === "string") return value.trim() ? "signed_in" : "guest";
  return value ? "signed_in" : "guest";
}

export function hostFromUrl(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export function pinAddedAttributes(
  context: FunnelContext & { count?: number; source: "tap" | "suggest" },
): FunnelAttrs {
  return {
    ...baseAttrs(context),
    "looktag.funnel.count": context.count ?? 1,
    "looktag.funnel.source": context.source,
  };
}

export function lookCreatedAttributes(
  context: FunnelContext & { pinCount: number; offerCount: number },
): FunnelAttrs {
  return {
    ...baseAttrs(context),
    "looktag.funnel.pin_count": context.pinCount,
    "looktag.funnel.offer_count": context.offerCount,
  };
}

export function shopResultAttributes(
  context: FunnelContext & {
    offerCount: number;
    retailerCount: number;
    source: "pin_search";
    tagId?: string;
  },
): FunnelAttrs {
  return {
    ...baseAttrs(context),
    "looktag.funnel.offer_count": context.offerCount,
    "looktag.funnel.retailer_count": context.retailerCount,
    "looktag.funnel.source": context.source,
    "looktag.funnel.tag_id": context.tagId,
  };
}

export function outboundShopClickAttributes(
  context: FunnelContext & {
    retailerId?: string;
    source: "editor_offer" | "piece_shop" | "compare_offer" | "shop_look";
    cheapest?: boolean;
    offerCount?: number;
    tagId?: string;
    urlHost?: string;
  },
): FunnelAttrs {
  return {
    ...baseAttrs(context),
    "looktag.funnel.cheapest": context.cheapest,
    "looktag.funnel.offer_count": context.offerCount,
    "looktag.funnel.retailer_id": context.retailerId,
    "looktag.funnel.source": context.source,
    "looktag.funnel.tag_id": context.tagId,
    "url.host": context.urlHost,
  };
}

