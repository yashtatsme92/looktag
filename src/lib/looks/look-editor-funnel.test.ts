import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  recordManualPinAdded,
  recordPinSearchResolved,
  recordSuggestedPinsAdded,
} from "./look-editor-funnel.ts";

describe("recordManualPinAdded", () => {
  it("records a single tap pin against the current draft", () => {
    const calls: Array<Record<string, unknown>> = [];
    recordManualPinAdded((payload) => calls.push(payload), {
      chrome: "phone",
      lookId: "draft_1",
      userId: "",
    });
    assert.deepEqual(calls, [
      {
        chrome: "phone",
        count: 1,
        lookId: "draft_1",
        source: "tap",
        userState: "guest",
      },
    ]);
  });
});

describe("recordSuggestedPinsAdded", () => {
  it("records the aggregated suggestion count", () => {
    const calls: Array<Record<string, unknown>> = [];
    recordSuggestedPinsAdded((payload) => calls.push(payload), {
      chrome: "phone",
      count: 3,
      lookId: "draft_2",
      userId: "user_1",
    });
    assert.deepEqual(calls, [
      {
        chrome: "phone",
        count: 3,
        lookId: "draft_2",
        source: "suggest",
        userState: "signed_in",
      },
    ]);
  });
});

describe("recordPinSearchResolved", () => {
  it("records offer and retailer counts for resolved shop results", () => {
    const calls: Array<Record<string, unknown>> = [];
    recordPinSearchResolved((payload) => calls.push(payload), {
      chrome: "phone",
      lookId: "draft_3",
      offers: [
        { retailerId: "zalando" },
        { retailerId: "zalando" },
        { retailerId: "zara" },
      ],
      tagId: "pin_1",
      userId: "user_2",
    });
    assert.deepEqual(calls, [
      {
        chrome: "phone",
        lookId: "draft_3",
        offerCount: 3,
        retailerCount: 2,
        source: "pin_search",
        tagId: "pin_1",
        userState: "signed_in",
      },
    ]);
  });
});

