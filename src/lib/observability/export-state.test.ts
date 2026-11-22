import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { currentLastExport, noteExportResults, resetExportState } from "./export-state.ts";

afterEach(() => {
  resetExportState();
});

describe("OTLP lastExport", () => {
  it("stays empty until an export succeeds", () => {
    assert.equal(currentLastExport(), "");
    assert.equal(noteExportResults([false, false], "2026-11-22T12:00:00.000Z"), "");
    assert.equal(currentLastExport(), "");
  });

  it("records a timestamp after a successful export", () => {
    const stamp = noteExportResults([false, true], "2026-11-22T12:00:00.000Z");
    assert.equal(stamp, "2026-11-22T12:00:00.000Z");
    assert.equal(currentLastExport(), "2026-11-22T12:00:00.000Z");
  });
});
