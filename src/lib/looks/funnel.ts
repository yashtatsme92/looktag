import type { Attributes } from "../observability/model";
import { recordMetric, startSpan } from "../observability/runtime.ts";
import {
  lookCreatedAttributes,
  outboundShopClickAttributes,
  pinAddedAttributes,
  shopResultAttributes,
} from "./funnel-model.ts";

type FunnelAttrs = Record<string, string | number | boolean | undefined>;

function emitFunnel(name: string, attributes: FunnelAttrs, value = 1) {
  const safe = asAttributes(attributes);
  const span = startSpan(name, { kind: "CLIENT", attributes: safe });
  span.end();
  recordMetric(name, value, { type: "counter", attributes: safe });
}

function asAttributes(attributes: FunnelAttrs): Attributes {
  const safe: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) safe[key] = value;
  }
  return safe;
}

export { funnelUserState, hostFromUrl } from "./funnel-model.ts";
export type { FunnelUserState } from "./funnel-model.ts";

export function recordPinAdded(
  context: Parameters<typeof pinAddedAttributes>[0],
) {
  const count = Math.max(1, context.count ?? 1);
  emitFunnel("looktag.funnel.pin_added", pinAddedAttributes(context), count);
}

export function recordLookCreated(
  context: Parameters<typeof lookCreatedAttributes>[0],
) {
  emitFunnel("looktag.funnel.look_created", lookCreatedAttributes(context));
}

export function recordShopResultShown(
  context: Parameters<typeof shopResultAttributes>[0],
) {
  emitFunnel("looktag.funnel.shop_result_shown", shopResultAttributes(context));
}

export function recordOutboundShopClick(
  context: Parameters<typeof outboundShopClickAttributes>[0],
) {
  emitFunnel("looktag.funnel.shop_outbound_click", outboundShopClickAttributes(context));
}
