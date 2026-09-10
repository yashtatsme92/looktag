import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PublicSignal } from "./model.ts";
import {
  buildOperationGraph,
  buildTraceGraphs,
  createTraceFilter,
  filterGraphs,
  layoutTraceGraph,
  parseFiltersJson,
  spanMatchesFilter,
  DEFAULT_FILTERS,
} from "./graph.ts";

function span(partial: Partial<PublicSignal> & Pick<PublicSignal, "id" | "name" | "traceId">): PublicSignal {
  return {
    kind: "span",
    status: "OK",
    spanId: partial.id,
    parentSpanId: null,
    spanKind: "SERVER",
    durationMs: 8,
    startTime: 1_000,
    attributes: {},
    ...partial,
  };
}

describe("trace graphs", () => {
  it("groups spans by trace and wires parent edges", () => {
    const graphs = buildTraceGraphs([
      span({ id: "root", name: "looktag.looks.list", traceId: "aa", startTime: 10, durationMs: 20 }),
      span({
        id: "seed",
        name: "looktag.looks.seed",
        traceId: "aa",
        parentSpanId: "root",
        startTime: 11,
        durationMs: 4,
      }),
      span({
        id: "query",
        name: "looktag.looks.query",
        traceId: "aa",
        parentSpanId: "root",
        startTime: 15,
        durationMs: 5,
      }),
      span({ id: "other", name: "ui.navigation", traceId: "bb", spanKind: "CLIENT", startTime: 40 }),
    ]);
    assert.equal(graphs.length, 2);
    const looks = graphs.find((row) => row.traceId === "aa");
    assert.ok(looks);
    assert.equal(looks.rootIds.join(), "root");
    assert.equal(looks.edges.length, 2);
    assert.equal(looks.name, "looktag.looks.list");
    assert.equal(looks.durationMs, 20);
  });

  it("treats missing parents as roots", () => {
    const [graph] = buildTraceGraphs([
      span({ id: "child", name: "child", traceId: "t", parentSpanId: "gone" }),
    ]);
    assert.deepEqual(graph.rootIds, ["child"]);
    assert.equal(graph.edges.length, 0);
  });

  it("builds an operation graph from parent-child names", () => {
    const graphs = buildTraceGraphs([
      span({ id: "a", name: "looktag.houses.get", traceId: "t" }),
      span({ id: "b", name: "looktag.houses.looks", traceId: "t", parentSpanId: "a" }),
      span({ id: "c", name: "looktag.houses.looks", traceId: "t2" }),
    ]);
    const ops = buildOperationGraph(graphs);
    const looks = ops.nodes.find((node) => node.name === "looktag.houses.looks");
    assert.equal(looks?.count, 2);
    assert.equal(ops.edges[0]?.from, "looktag.houses.get");
    assert.equal(ops.edges[0]?.to, "looktag.houses.looks");
  });

  it("lays out children to the right of the root", () => {
    const [graph] = buildTraceGraphs([
      span({ id: "a", name: "root", traceId: "t" }),
      span({ id: "b", name: "child", traceId: "t", parentSpanId: "a" }),
    ]);
    const layout = layoutTraceGraph(graph);
    const root = layout.nodes.find((node) => node.id === "a");
    const child = layout.nodes.find((node) => node.id === "b");
    assert.ok(root && child);
    assert.ok(child.x > root.x);
    assert.equal(layout.edges.length, 1);
  });
});

describe("admin filters", () => {
  const errorSpan = span({ id: "e", name: "boom", traceId: "t", status: "ERROR", durationMs: 250 });
  const okSpan = span({ id: "o", name: "looktag.looks.list", traceId: "u", durationMs: 12 });

  it("matches status, duration, and name", () => {
    assert.equal(spanMatchesFilter(errorSpan, createTraceFilter({ field: "status", op: "eq", value: "ERROR" })), true);
    assert.equal(spanMatchesFilter(okSpan, createTraceFilter({ field: "durationMs", op: "gte", value: "100" })), false);
    assert.equal(spanMatchesFilter(okSpan, createTraceFilter({ field: "name", op: "contains", value: "looks" })), true);
  });

  it("ANDs enabled filters across a trace", () => {
    const graphs = buildTraceGraphs([errorSpan, okSpan]);
    const filtered = filterGraphs(graphs, [
      createTraceFilter({ enabled: true, field: "status", op: "eq", value: "ERROR" }),
      createTraceFilter({ enabled: false, field: "name", op: "contains", value: "looks" }),
    ]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.name, "boom");
  });

  it("parses extras JSON and falls back to defaults", () => {
    const parsed = parseFiltersJson({ filters: [{ id: "custom", enabled: true, field: "name", op: "eq", value: "x" }] });
    assert.equal(parsed[0]?.id, "custom");
    assert.equal(parsed[0]?.enabled, true);
    const missing = parseFiltersJson("");
    assert.equal(missing.length, DEFAULT_FILTERS.length);
  });

  it("matches attribute filters", () => {
    const tagged = span({
      id: "s",
      name: "looktag.looks.get",
      traceId: "t",
      attributes: { "rpc.method": "getLookById" },
    });
    assert.equal(
      spanMatchesFilter(
        tagged,
        createTraceFilter({ field: "attribute", op: "eq", value: "getLookById", attrKey: "rpc.method" }),
      ),
      true,
    );
  });
});
