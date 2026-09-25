import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  funnelUserState,
  lookCreatedAttributes,
  outboundShopClickAttributes,
  pinAddedAttributes,
  shopResultAttributes,
} from "./funnel-model.ts";

describe("funnelUserState", () => {
  it("maps empty values to guest and present values to signed-in", () => {
    assert.equal(funnelUserState(""), "guest");
    assert.equal(funnelUserState(false), "guest");
    assert.equal(funnelUserState("user_123"), "signed_in");
    assert.equal(funnelUserState(true), "signed_in");
  });
});

describe("pinAddedAttributes", () => {
  it("captures source, count, viewer state, and chrome", () => {
    assert.deepEqual(
      pinAddedAttributes({
        chrome: "phone",
        count: 2,
        lookId: "look_1",
        source: "suggest",
        userState: "guest",
      }),
      {
        "looktag.ui.chrome": "phone",
        "looktag.look.id": "look_1",
        "looktag.funnel.user_state": "guest",
        "looktag.funnel.count": 2,
        "looktag.funnel.source": "suggest",
      },
    );
  });
});

describe("lookCreatedAttributes", () => {
  it("keeps the saved look counts for funnel spans", () => {
    assert.deepEqual(
      lookCreatedAttributes({
        chrome: "phone",
        lookId: "look_2",
        offerCount: 3,
        pinCount: 2,
        userState: "signed_in",
      }),
      {
        "looktag.ui.chrome": "phone",
        "looktag.look.id": "look_2",
        "looktag.funnel.user_state": "signed_in",
        "looktag.funnel.pin_count": 2,
        "looktag.funnel.offer_count": 3,
      },
    );
  });
});

describe("shopResultAttributes", () => {
  it("describes resolved offers for a searched pin", () => {
    assert.deepEqual(
      shopResultAttributes({
        chrome: "phone",
        lookId: "look_3",
        offerCount: 4,
        retailerCount: 3,
        source: "pin_search",
        tagId: "pin_1",
        userState: "signed_in",
      }),
      {
        "looktag.ui.chrome": "phone",
        "looktag.look.id": "look_3",
        "looktag.funnel.user_state": "signed_in",
        "looktag.funnel.offer_count": 4,
        "looktag.funnel.retailer_count": 3,
        "looktag.funnel.source": "pin_search",
        "looktag.funnel.tag_id": "pin_1",
      },
    );
  });
});

describe("outboundShopClickAttributes", () => {
  it("captures source and retailer context for outbound shop clicks", () => {
    assert.deepEqual(
      outboundShopClickAttributes({
        cheapest: true,
        chrome: "desktop",
        lookId: "look_4",
        offerCount: 2,
        retailerId: "zalando",
        source: "piece_shop",
        tagId: "pin_2",
        urlHost: "www.zalando.de",
        userState: "guest",
      }),
      {
        "looktag.ui.chrome": "desktop",
        "looktag.look.id": "look_4",
        "looktag.funnel.user_state": "guest",
        "looktag.funnel.cheapest": true,
        "looktag.funnel.offer_count": 2,
        "looktag.funnel.retailer_id": "zalando",
        "looktag.funnel.source": "piece_shop",
        "looktag.funnel.tag_id": "pin_2",
        "url.host": "www.zalando.de",
      },
    );
  });
});
