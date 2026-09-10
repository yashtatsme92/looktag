import type { PublicSignal, SignalKind, SpanKindName } from "./model.ts";

export const FILTER_FIELDS = ["kind", "status", "name", "durationMs", "attribute", "spanKind"] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export const FILTER_OPS = ["eq", "neq", "contains", "startsWith", "gte", "lte"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export type TraceFilter = {
  id: string;
  enabled: boolean;
  label: string;
  field: FilterField;
  op: FilterOp;
  value: string;
  attrKey?: string;
};

export const DEFAULT_FILTERS: TraceFilter[] = [
  { id: "errors", enabled: false, label: "Errors", field: "status", op: "eq", value: "ERROR" },
  { id: "slow", enabled: false, label: "Slow (≥100ms)", field: "durationMs", op: "gte", value: "100" },
  { id: "client", enabled: false, label: "Client", field: "spanKind", op: "eq", value: "CLIENT" },
  { id: "server", enabled: false, label: "Server", field: "spanKind", op: "eq", value: "SERVER" },
  { id: "looks", enabled: false, label: "Looks", field: "name", op: "contains", value: "looktag.looks" },
  { id: "houses", enabled: false, label: "Houses", field: "name", op: "contains", value: "looktag.houses" },
  { id: "search", enabled: false, label: "Search", field: "name", op: "contains", value: "looktag.search" },
  { id: "ui", enabled: false, label: "UI", field: "name", op: "startsWith", value: "ui." },
];

export const OPS_FOR_FIELD: Record<FilterField, FilterOp[]> = {
  kind: ["eq", "neq"],
  status: ["eq", "neq"],
  name: ["contains", "eq", "startsWith"],
  durationMs: ["gte", "lte", "eq"],
  attribute: ["eq", "contains"],
  spanKind: ["eq", "neq"],
};

export type TraceEdge = { from: string; to: string };

export type TraceGraph = {
  traceId: string;
  nodes: PublicSignal[];
  edges: TraceEdge[];
  rootIds: string[];
  startTime: number;
  durationMs: number;
  hasError: boolean;
  name: string;
};

export type OperationNode = {
  name: string;
  count: number;
  errors: number;
  p95Ms: number;
};

export type OperationEdge = {
  from: string;
  to: string;
  count: number;
};

export type OperationGraph = {
  nodes: OperationNode[];
  edges: OperationEdge[];
};

export type LaidNode = {
  id: string;
  name: string;
  status: string;
  durationMs: number | null;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LaidEdge = {
  from: string;
  to: string;
  d: string;
};

export type GraphLayout = {
  nodes: LaidNode[];
  edges: LaidEdge[];
  width: number;
  height: number;
};

const NODE_W = 152;
const NODE_H = 44;
const GAP_X = 40;
const GAP_Y = 16;
const PAD = 16;

function cloneFilter(filter: TraceFilter): TraceFilter {
  return { ...filter, attrKey: filter.attrKey };
}

export function newFilterId(): string {
  return `flt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createTraceFilter(partial: Partial<TraceFilter> = {}): TraceFilter {
  const field: FilterField = FILTER_FIELDS.includes(partial.field as FilterField)
    ? (partial.field as FilterField)
    : "name";
  const allowed = OPS_FOR_FIELD[field];
  const op: FilterOp = allowed.includes(partial.op as FilterOp) ? (partial.op as FilterOp) : allowed[0];
  return {
    id: partial.id && partial.id.trim() ? partial.id.trim().slice(0, 64) : newFilterId(),
    enabled: Boolean(partial.enabled),
    label: (partial.label || "Filter").trim().slice(0, 48) || "Filter",
    field,
    op,
    value: String(partial.value ?? "").slice(0, 160),
    attrKey: field === "attribute" ? String(partial.attrKey ?? "").slice(0, 80) : undefined,
  };
}

export function parseTraceFilter(raw: unknown): TraceFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (!FILTER_FIELDS.includes(row.field as FilterField)) return null;
  return createTraceFilter({
    id: row.id,
    enabled: Boolean(row.enabled),
    label: typeof row.label === "string" ? row.label : "Filter",
    field: row.field as FilterField,
    op: row.op as FilterOp,
    value: typeof row.value === "string" || typeof row.value === "number" ? String(row.value) : "",
    attrKey: typeof row.attrKey === "string" ? row.attrKey : undefined,
  });
}

export function parseFiltersJson(raw: unknown): TraceFilter[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return DEFAULT_FILTERS.map(cloneFilter);
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return DEFAULT_FILTERS.map(cloneFilter);
    }
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const bag = parsed as Record<string, unknown>;
    parsed = bag.filters ?? bag.traceFilters;
  }
  if (parsed == null) return DEFAULT_FILTERS.map(cloneFilter);
  if (!Array.isArray(parsed)) return DEFAULT_FILTERS.map(cloneFilter);
  return parsed.map(parseTraceFilter).filter((row): row is TraceFilter => Boolean(row));
}

export function filtersExtras(filters: TraceFilter[]): Record<string, unknown> {
  return { filters: filters.map(cloneFilter) };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

export function buildTraceGraphs(signals: PublicSignal[]): TraceGraph[] {
  const groups = new Map<string, PublicSignal[]>();
  for (const signal of signals) {
    if (signal.kind !== "span" || !signal.traceId) continue;
    const list = groups.get(signal.traceId) ?? [];
    list.push(signal);
    groups.set(signal.traceId, list);
  }
  const graphs: TraceGraph[] = [];
  for (const [traceId, nodes] of groups) {
    const bySpan = new Map<string, PublicSignal>();
    for (const node of nodes) {
      if (node.spanId) bySpan.set(node.spanId, node);
    }
    const edges: TraceEdge[] = [];
    const rooted = new Set<string>();
    for (const node of nodes) {
      const parent = node.parentSpanId && bySpan.get(node.parentSpanId);
      if (parent && node.spanId && parent.id !== node.id) {
        edges.push({ from: parent.id, to: node.id });
        rooted.add(node.id);
      }
    }
    const rootIds = nodes.filter((node) => !rooted.has(node.id)).map((node) => node.id);
    const starts = nodes.map((node) => node.startTime).filter((n) => Number.isFinite(n));
    const ends = nodes.map((node) => node.startTime + (node.durationMs ?? 0));
    const startTime = starts.length ? Math.min(...starts) : 0;
    const endTime = ends.length ? Math.max(...ends) : startTime;
    const root = nodes.find((node) => node.id === rootIds[0]) ?? nodes[0];
    graphs.push({
      traceId,
      nodes,
      edges,
      rootIds: rootIds.length ? rootIds : nodes[0] ? [nodes[0].id] : [],
      startTime,
      durationMs: Math.max(0, endTime - startTime),
      hasError: nodes.some((node) => node.status === "ERROR"),
      name: root?.name || traceId.slice(0, 8),
    });
  }
  graphs.sort((a, b) => b.startTime - a.startTime);
  return graphs;
}

export function buildOperationGraph(graphs: TraceGraph[]): OperationGraph {
  const nodes = new Map<string, { name: string; count: number; errors: number; durations: number[] }>();
  const edges = new Map<string, OperationEdge>();

  function touch(span: PublicSignal) {
    const current = nodes.get(span.name) ?? { name: span.name, count: 0, errors: 0, durations: [] };
    current.count += 1;
    if (span.status === "ERROR") current.errors += 1;
    if (typeof span.durationMs === "number") current.durations.push(span.durationMs);
    nodes.set(span.name, current);
  }

  for (const graph of graphs) {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const node of graph.nodes) touch(node);
    for (const edge of graph.edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;
      const key = `${from.name}\0${to.name}`;
      const current = edges.get(key) ?? { from: from.name, to: to.name, count: 0 };
      current.count += 1;
      edges.set(key, current);
    }
  }

  return {
    nodes: [...nodes.values()].map((node) => ({
      name: node.name,
      count: node.count,
      errors: node.errors,
      p95Ms: percentile(node.durations, 0.95),
    })),
    edges: [...edges.values()],
  };
}

function compareText(left: string, op: FilterOp, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (op === "eq") return a === b;
  if (op === "neq") return a !== b;
  if (op === "contains") return a.includes(b);
  if (op === "startsWith") return a.startsWith(b);
  return false;
}

function compareNumber(left: number, op: FilterOp, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (op === "eq") return left === right;
  if (op === "gte") return left >= right;
  if (op === "lte") return left <= right;
  if (op === "neq") return left !== right;
  return false;
}

export function spanMatchesFilter(span: PublicSignal, filter: TraceFilter): boolean {
  const value = filter.value;
  if (filter.field === "kind") return compareText(span.kind, filter.op, value);
  if (filter.field === "status") return compareText(span.status || "", filter.op, value);
  if (filter.field === "name") return compareText(span.name, filter.op, value);
  if (filter.field === "spanKind") return compareText(span.spanKind || "", filter.op, value);
  if (filter.field === "durationMs") {
    const n = Number(value);
    return compareNumber(span.durationMs ?? 0, filter.op, n);
  }
  const key = filter.attrKey?.trim();
  if (!key) return false;
  const attr = span.attributes[key];
  if (attr === undefined) return false;
  return compareText(String(attr), filter.op, value);
}

export function traceMatchesFilters(graph: TraceGraph, filters: TraceFilter[]): boolean {
  const active = filters.filter((filter) => filter.enabled);
  if (active.length === 0) return true;
  return active.every((filter) => {
    if (filter.field === "durationMs") {
      const n = Number(filter.value);
      if (graph.nodes.some((span) => spanMatchesFilter(span, filter))) return true;
      return compareNumber(graph.durationMs, filter.op, n);
    }
    if (filter.field === "status" && filter.value.toUpperCase() === "ERROR" && filter.op === "eq") {
      return graph.hasError;
    }
    return graph.nodes.some((span) => spanMatchesFilter(span, filter));
  });
}

export function filterGraphs(graphs: TraceGraph[], filters: TraceFilter[]): TraceGraph[] {
  return graphs.filter((graph) => traceMatchesFilters(graph, filters));
}

export function spanDepths(graph: TraceGraph): Map<string, number> {
  const depths = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = children.get(edge.from) ?? [];
    list.push(edge.to);
    children.set(edge.from, list);
  }
  const visit = (id: string, depth: number) => {
    if (depths.has(id) && (depths.get(id) ?? 0) <= depth) return;
    depths.set(id, depth);
    for (const child of children.get(id) ?? []) visit(child, depth + 1);
  };
  for (const root of graph.rootIds) visit(root, 0);
  for (const node of graph.nodes) if (!depths.has(node.id)) depths.set(node.id, 0);
  return depths;
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export function layoutTraceGraph(graph: TraceGraph): GraphLayout {
  const depths = spanDepths(graph);
  const columns = new Map<number, PublicSignal[]>();
  for (const node of graph.nodes) {
    const depth = depths.get(node.id) ?? 0;
    const list = columns.get(depth) ?? [];
    list.push(node);
    columns.set(depth, list);
  }
  for (const list of columns.values()) {
    list.sort((a, b) => a.startTime - b.startTime || a.name.localeCompare(b.name));
  }
  const maxDepth = Math.max(0, ...depths.values());
  const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
  const laid: LaidNode[] = [];
  const byId = new Map<string, LaidNode>();
  for (const [depth, list] of columns) {
    list.forEach((node, index) => {
      const laidNode: LaidNode = {
        id: node.id,
        name: node.name,
        status: node.status,
        durationMs: node.durationMs,
        depth,
        x: PAD + depth * (NODE_W + GAP_X),
        y: PAD + index * (NODE_H + GAP_Y),
        w: NODE_W,
        h: NODE_H,
      };
      laid.push(laidNode);
      byId.set(node.id, laidNode);
    });
  }
  const edges: LaidEdge[] = graph.edges
    .map((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return null;
      return {
        from: edge.from,
        to: edge.to,
        d: edgePath(from.x + from.w, from.y + from.h / 2, to.x, to.y + to.h / 2),
      };
    })
    .filter((edge): edge is LaidEdge => Boolean(edge));
  return {
    nodes: laid,
    edges,
    width: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * GAP_X,
    height: PAD * 2 + maxRows * NODE_H + (maxRows - 1) * GAP_Y,
  };
}

export function layoutOperationGraph(graph: OperationGraph): GraphLayout {
  const incoming = new Set(graph.edges.map((edge) => edge.to));
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = children.get(edge.from) ?? [];
    if (!list.includes(edge.to)) list.push(edge.to);
    children.set(edge.from, list);
  }
  const depths = new Map<string, number>();
  const visit = (name: string, depth: number) => {
    if ((depths.get(name) ?? -1) >= depth) return;
    depths.set(name, depth);
    for (const child of children.get(name) ?? []) visit(child, depth + 1);
  };
  const roots = graph.nodes.map((node) => node.name).filter((name) => !incoming.has(name));
  for (const root of roots.length ? roots : graph.nodes.map((n) => n.name)) visit(root, 0);
  for (const node of graph.nodes) if (!depths.has(node.name)) depths.set(node.name, 0);

  const columns = new Map<number, OperationNode[]>();
  for (const node of graph.nodes) {
    const depth = depths.get(node.name) ?? 0;
    const list = columns.get(depth) ?? [];
    list.push(node);
    columns.set(depth, list);
  }
  for (const list of columns.values()) {
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  const maxDepth = Math.max(0, ...depths.values());
  const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
  const laid: LaidNode[] = [];
  const byName = new Map<string, LaidNode>();
  for (const [depth, list] of columns) {
    list.forEach((node, index) => {
      const laidNode: LaidNode = {
        id: node.name,
        name: node.name,
        status: node.errors ? "ERROR" : "OK",
        durationMs: node.p95Ms,
        depth,
        x: PAD + depth * (NODE_W + GAP_X),
        y: PAD + index * (NODE_H + GAP_Y),
        w: NODE_W,
        h: NODE_H,
      };
      laid.push(laidNode);
      byName.set(node.name, laidNode);
    });
  }
  const edges: LaidEdge[] = graph.edges
    .map((edge) => {
      const from = byName.get(edge.from);
      const to = byName.get(edge.to);
      if (!from || !to) return null;
      return {
        from: edge.from,
        to: edge.to,
        d: edgePath(from.x + from.w, from.y + from.h / 2, to.x, to.y + to.h / 2),
      };
    })
    .filter((edge): edge is LaidEdge => Boolean(edge));
  return {
    nodes: laid,
    edges,
    width: Math.max(PAD * 2 + NODE_W, PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * GAP_X),
    height: Math.max(PAD * 2 + NODE_H, PAD * 2 + maxRows * NODE_H + (maxRows - 1) * GAP_Y),
  };
}

export function orderedSpans(graph: TraceGraph): PublicSignal[] {
  const depths = spanDepths(graph);
  return [...graph.nodes].sort((a, b) => {
    const depth = (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0);
    if (depth) return depth;
    return a.startTime - b.startTime;
  });
}

export function filterLabel(filter: TraceFilter): string {
  if (filter.label.trim()) return filter.label;
  if (filter.field === "attribute") return `${filter.attrKey || "attr"} ${filter.op} ${filter.value}`;
  return `${filter.field} ${filter.op} ${filter.value}`;
}

export function isSignalKind(value: string): value is SignalKind {
  return value === "span" || value === "metric" || value === "log";
}

export function isSpanKind(value: string): value is SpanKindName {
  return value === "INTERNAL" || value === "SERVER" || value === "CLIENT";
}
