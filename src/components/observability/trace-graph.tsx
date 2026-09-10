import { cn } from "@/lib/utils";
import type { OperationGraph, TraceGraph } from "@/lib/observability/graph";
import { layoutOperationGraph, layoutTraceGraph, orderedSpans, spanDepths } from "@/lib/observability/graph";

export function OperationMap({
  graph,
  activeName,
  onSelect,
}: {
  graph: OperationGraph;
  activeName?: string;
  onSelect: (name: string) => void;
}) {
  if (graph.nodes.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No traces yet. Open Looks or a house, then come back — nested work lands here as a graph.
      </p>
    );
  }
  const layout = layoutOperationGraph(graph);
  const byName = new Map(graph.nodes.map((node) => [node.name, node]));
  return (
    <div className="-mx-1 overflow-x-auto px-1" data-trace-graph="operations">
      <svg
        role="img"
        aria-label="Operation graph"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="max-w-full"
        style={{ width: layout.width, height: layout.height }}
      >
        {layout.edges.map((edge) => (
          <path
            key={`${edge.from}-${edge.to}`}
            d={edge.d}
            fill="none"
            className="stroke-border"
            strokeWidth="1.5"
          />
        ))}
        {layout.nodes.map((node) => {
          const stats = byName.get(node.id);
          const active = activeName === node.id;
          const error = (stats?.errors ?? 0) > 0;
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
              <rect
                width={node.w}
                height={node.h}
                rx="8"
                className={cn(
                  error ? "fill-destructive/15 stroke-destructive" : "fill-card stroke-border",
                  active && "stroke-foreground",
                )}
                strokeWidth={active ? 2 : 1}
              />
              <foreignObject width={node.w} height={node.h}>
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  className="flex size-full flex-col justify-center px-2 text-left"
                  aria-pressed={active}
                >
                  <span className="truncate text-caption font-medium text-foreground">{shortName(node.name)}</span>
                  <span className="truncate ds-kicker">{stats?.count ?? 0} · {stats?.p95Ms ? `${stats.p95Ms} ms` : "—"}</span>
                </button>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TraceDag({
  graph,
  selectedId,
  onSelect,
}: {
  graph: TraceGraph;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const layout = layoutTraceGraph(graph);
  return (
    <div className="-mx-1 overflow-x-auto px-1" data-trace-graph="trace">
      <svg
        role="img"
        aria-label={`Trace ${graph.name}`}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="max-w-full"
        style={{ width: layout.width, height: Math.max(layout.height, 76) }}
      >
        {layout.edges.map((edge) => (
          <path
            key={`${edge.from}-${edge.to}`}
            d={edge.d}
            fill="none"
            className="stroke-foreground/40"
            strokeWidth="1.5"
          />
        ))}
        {layout.nodes.map((node) => {
          const active = selectedId === node.id;
          const error = node.status === "ERROR";
          return (
            <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
              <rect
                width={node.w}
                height={node.h}
                rx="8"
                className={cn(
                  error ? "fill-destructive/15 stroke-destructive" : "fill-muted stroke-border",
                  active && "stroke-foreground",
                )}
                strokeWidth={active ? 2 : 1}
              />
              <foreignObject width={node.w} height={node.h}>
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  className="flex size-full flex-col justify-center px-2 text-left"
                  aria-pressed={active}
                >
                  <span className="truncate text-caption font-medium text-foreground">{shortName(node.name)}</span>
                  <span className="truncate ds-kicker">{node.durationMs != null ? `${node.durationMs} ms` : "span"}</span>
                </button>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TraceWaterfall({
  graph,
  selectedId,
  onSelect,
}: {
  graph: TraceGraph;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const depths = spanDepths(graph);
  const rows = orderedSpans(graph);
  const total = Math.max(graph.durationMs, 1);
  return (
    <ul className="flex flex-col gap-2" data-trace-graph="waterfall">
      {rows.map((span) => {
        const depth = depths.get(span.id) ?? 0;
        const offset = Math.max(0, ((span.startTime - graph.startTime) / total) * 100);
        const width = Math.max(4, ((span.durationMs ?? 0) / total) * 100);
        const active = selectedId === span.id;
        return (
          <li key={span.id}>
            <button
              type="button"
              onClick={() => onSelect(span.id)}
              className={cn(
                "flex min-h-11 w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left",
                active ? "bg-accent" : "hover:bg-accent/60",
              )}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">{shortName(span.name)}</span>
                <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                  {span.durationMs != null ? `${span.durationMs} ms` : "—"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-xs bg-muted">
                <span
                  className={cn(
                    "block h-full rounded-xs",
                    span.status === "ERROR" ? "bg-destructive" : "bg-foreground",
                  )}
                  style={{ marginLeft: `${offset}%`, width: `${width}%` }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function shortName(name: string): string {
  return name.replace(/^looktag\./, "");
}
