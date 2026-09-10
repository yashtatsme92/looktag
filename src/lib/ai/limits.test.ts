import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  AI_SEARCH_LIMITS,
  AiSearchUnauthorizedError,
  RateLimitError,
  aiSearchCost,
  clampImageDataUrl,
  consumeAiSearchQuota,
  requireAiSearchUserId,
  resetAiSearchQuotaForTests,
} from "./limits.ts";

beforeEach(() => {
  resetAiSearchQuotaForTests();
});

describe("requireAiSearchUserId", () => {
  it("denies anonymous / empty callers with 401 Unauthorized", () => {
    for (const value of [undefined, null, "", "   "] as const) {
      assert.throws(
        () => requireAiSearchUserId(value),
        (error: unknown) => {
          assert.ok(error instanceof AiSearchUnauthorizedError);
          assert.equal(error.message, "Unauthorized");
          assert.equal(error.status, 401);
          assert.equal(error.name, "UnauthorizedError");
          return true;
        },
      );
    }
  });

  it("returns a trimmed user id when present", () => {
    assert.equal(requireAiSearchUserId("  user-1  "), "user-1");
  });
});

describe("consumeAiSearchQuota", () => {
  it("allows traffic under the per-user hourly budget", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < AI_SEARCH_LIMITS.userPerHour; i += 1) {
      consumeAiSearchQuota({ userId: "u1", cost: 1, now });
    }
    assert.throws(
      () => consumeAiSearchQuota({ userId: "u1", cost: 1, now }),
      (error: unknown) => error instanceof RateLimitError && error.status === 429,
    );
  });

  it("tracks users independently", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < AI_SEARCH_LIMITS.userPerHour; i += 1) {
      consumeAiSearchQuota({ userId: "a", cost: 1, now });
    }
    assert.doesNotThrow(() => consumeAiSearchQuota({ userId: "b", cost: 1, now }));
  });

  it("enforces the IP hourly budget when an IP is supplied", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < AI_SEARCH_LIMITS.ipPerHour; i += 1) {
      consumeAiSearchQuota({ userId: `user-${i}`, ip: "203.0.113.9", cost: 1, now });
    }
    assert.throws(
      () => consumeAiSearchQuota({ userId: "fresh", ip: "203.0.113.9", cost: 1, now }),
      RateLimitError,
    );
  });

  it("enforces the daily user budget across hourly resets", () => {
    const dayStart = 1_700_000_000_000;
    const hour = 60 * 60 * 1000;
    // Spend almost the daily budget across different hours.
    let spent = 0;
    let hourIndex = 0;
    while (spent + AI_SEARCH_LIMITS.userPerHour <= AI_SEARCH_LIMITS.userPerDay) {
      const now = dayStart + hourIndex * hour;
      for (let i = 0; i < AI_SEARCH_LIMITS.userPerHour; i += 1) {
        consumeAiSearchQuota({ userId: "daily", cost: 1, now });
        spent += 1;
      }
      hourIndex += 1;
    }
    const remainder = AI_SEARCH_LIMITS.userPerDay - spent;
    const now = dayStart + hourIndex * hour;
    for (let i = 0; i < remainder; i += 1) {
      consumeAiSearchQuota({ userId: "daily", cost: 1, now });
    }
    assert.throws(
      () => consumeAiSearchQuota({ userId: "daily", cost: 1, now }),
      RateLimitError,
    );
  });

  it("rejects missing user ids as unauthorized rather than metering anonymously", () => {
    assert.throws(
      () => consumeAiSearchQuota({ userId: "" }),
      AiSearchUnauthorizedError,
    );
  });
});

describe("clampImageDataUrl", () => {
  it("accepts a small image data URL", () => {
    const ok = "data:image/jpeg;base64,abc";
    assert.equal(clampImageDataUrl(ok), ok);
  });

  it("rejects oversized payloads early", () => {
    const huge = `data:image/png;base64,${"x".repeat(AI_SEARCH_LIMITS.maxImageDataUrlChars)}`;
    assert.equal(clampImageDataUrl(huge), null);
  });

  it("rejects non-image and empty values", () => {
    assert.equal(clampImageDataUrl("https://example.com/a.jpg"), null);
    assert.equal(clampImageDataUrl(""), null);
    assert.equal(clampImageDataUrl(undefined), null);
  });
});

describe("aiSearchCost", () => {
  it("weights vision-heavy calls higher", () => {
    assert.equal(aiSearchCost("suggestPieces"), 3);
    assert.equal(aiSearchCost("searchPin"), 2);
    assert.equal(aiSearchCost("suggestShops"), 1);
  });
});
