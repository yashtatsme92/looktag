import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminGate } from "@/components/admin/admin-gate";
import { Chip } from "@/components/ds";
import { AdminNav } from "@/components/observability/admin-nav";
import { FilterChips, FilterEditor } from "@/components/observability/trace-filters";
import { OperationMap, TraceDag, TraceWaterfall } from "@/components/observability/trace-graph";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getObservability,
  HEADER_KEEP_VALUE,
  listObservabilitySignals,
  probeObservability,
  saveObservability,
  saveObservabilityFilters,
} from "@/lib/observability/api";
import {
  buildOperationGraph,
  createTraceFilter,
  filterGraphs,
  type OperationGraph,
  type TraceFilter,
  type TraceGraph,
} from "@/lib/observability/graph";
import type { PublicSignal, TelemetrySummary } from "@/lib/observability/model";

export const Route = createFileRoute("/admin_/observability")({
  component: ObservabilityRoute,
});

function ObservabilityRoute() {
  return (
    <AdminGate>
      <ObservabilityPage />
    </AdminGate>
  );
}

type KindFilter = "all" | "span" | "metric" | "log";
type LiveView = "graph" | "buffer";

function ObservabilityPage() {
  const [endpoint, setEndpoint] = useState("");
  const [serviceName, setServiceName] = useState("looktag");
  const [headers, setHeaders] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [tracesEnabled, setTracesEnabled] = useState(true);
  const [metricsEnabled, setMetricsEnabled] = useState(true);
  const [logsEnabled, setLogsEnabled] = useState(true);
  const [destination, setDestination] = useState<{ traces: string; metrics: string; logs: string } | null>(null);
  const [signals, setSignals] = useState<PublicSignal[]>([]);
  const [graphs, setGraphs] = useState<TraceGraph[]>([]);
  const [operations, setOperations] = useState<OperationGraph>({ nodes: [], edges: [] });
  const [filters, setFilters] = useState<TraceFilter[]>([]);
  const [draft, setDraft] = useState<TraceFilter>(() => createTraceFilter({ label: "Custom", field: "name", op: "contains" }));
  const [summary, setSummary] = useState<TelemetrySummary>({
    spans: 0,
    errors: 0,
    metrics: 0,
    logs: 0,
    traces: 0,
    p95Ms: 0,
    lastExport: "",
  });
  const [filter, setFilter] = useState<KindFilter>("all");
  const [view, setView] = useState<LiveView>("graph");
  const [saving, setSaving] = useState(false);
  const [savingFilters, setSavingFilters] = useState(false);
  const [probing, setProbing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<string | null>(null);
  const [activeOp, setActiveOp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getObservability()
      .then((payload) => {
        if (cancelled) return;
        setEndpoint(payload.config.otlpEndpoint);
        setServiceName(payload.config.serviceName);
        setHeaders(payload.config.headersMasked);
        setEnabled(payload.config.enabled);
        setTracesEnabled(payload.config.tracesEnabled);
        setMetricsEnabled(payload.config.metricsEnabled);
        setLogsEnabled(payload.config.logsEnabled);
        setDestination(payload.config.destination);
        setSignals(payload.signals);
        setGraphs(payload.graphs);
        setOperations(payload.operations);
        setFilters(payload.config.filters);
        setSummary(payload.summary);
        setSelectedTrace((current) => current ?? payload.graphs[0]?.traceId ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      const kind = filter === "all" ? undefined : filter;
      void listObservabilitySignals({ data: { kind } }).then((payload) => {
        setSignals(payload.signals);
        setGraphs(payload.graphs);
        setOperations(payload.operations);
        setSummary(payload.summary);
      });
    };
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [loaded, filter]);

  const visibleGraphs = useMemo(() => {
    const next = filterGraphs(graphs, filters);
    if (!activeOp) return next;
    return next.filter((graph) => graph.nodes.some((node) => node.name === activeOp));
  }, [graphs, filters, activeOp]);

  const visibleOperations = useMemo(
    () => buildOperationGraph(visibleGraphs),
    [visibleGraphs],
  );

  const visibleSignals = useMemo(
    () => (filter === "all" ? signals : signals.filter((row) => row.kind === filter)),
    [filter, signals],
  );

  const current = visibleGraphs.find((graph) => graph.traceId === selectedTrace) ?? visibleGraphs[0] ?? null;

  useEffect(() => {
    if (!current) {
      setSelectedSpan(null);
      return;
    }
    if (selectedTrace !== current.traceId) setSelectedTrace(current.traceId);
    if (!current.nodes.some((node) => node.id === selectedSpan)) {
      setSelectedSpan(current.rootIds[0] ?? current.nodes[0]?.id ?? null);
    }
  }, [current, selectedTrace, selectedSpan]);

  async function handleSave() {
    setSaving(true);
    try {
      const headersChanged = !headers.includes("••••");
      const config = await saveObservability({
        data: {
          enabled,
          tracesEnabled,
          metricsEnabled,
          logsEnabled,
          serviceName,
          otlpEndpoint: endpoint,
          otlpHeaders: headersChanged ? headers : HEADER_KEEP_VALUE,
        },
      });
      setDestination(config.destination);
      setHeaders(config.headersMasked);
      toast.success(config.destination ? "OTLP destination saved" : "Signals stay on-device until you add a collector");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function persistFilters(next: TraceFilter[]) {
    setFilters(next);
    setSavingFilters(true);
    try {
      const config = await saveObservabilityFilters({ data: { filters: next } });
      setFilters(config.filters);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save filters");
    } finally {
      setSavingFilters(false);
    }
  }

  function toggleFilter(id: string) {
    void persistFilters(filters.map((row) => (row.id === id ? { ...row, enabled: !row.enabled } : row)));
  }

  function addFilter() {
    const next = createTraceFilter({ ...draft, enabled: true, id: "" });
    void persistFilters([...filters, next]);
    setDraft(createTraceFilter({ label: "Custom", field: "name", op: "contains" }));
  }

  async function handleProbe() {
    setProbing(true);
    try {
      await handleSave();
      const result = await probeObservability();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Probe failed");
    } finally {
      setProbing(false);
    }
  }

  return (
    <AppShell title="Signals" backTo="/admin">
      <ScreenTitle kicker="Catalog">Signals</ScreenTitle>
      <AdminNav current="signals" />
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        Traces are a graph of parent and child spans. Admin filters shape that graph. OTLP still ships the same
        payload any collector understands.
      </p>

      <section className="mb-5 grid grid-cols-2 gap-2" data-loaded={loaded ? "true" : "false"}>
        <Stat label="Traces" value={summary.traces} />
        <Stat label="Spans" value={summary.spans} />
        <Stat label="Errors" value={summary.errors} />
        <Stat label="p95" value={summary.p95Ms ? `${summary.p95Ms} ms` : "—"} />
      </section>

      <section className="mb-5 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">OTLP destination</h2>
          <Badge variant={destination ? "default" : "muted"}>{destination ? "Shipping" : "Local only"}</Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Paste an OTLP/HTTP base URL. Grafana Tempo, Jaeger, Honeycomb, Datadog, New Relic, Lightstep and Dash0 all
          speak this protocol.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <Label htmlFor="otel-enabled" className="text-sm font-medium">
              Record signals
            </Label>
            <Switch id="otel-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ToggleChip label="Traces" checked={tracesEnabled} onChange={setTracesEnabled} />
            <ToggleChip label="Metrics" checked={metricsEnabled} onChange={setMetricsEnabled} />
            <ToggleChip label="Logs" checked={logsEnabled} onChange={setLogsEnabled} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otel-service">Service name</Label>
            <Input
              id="otel-service"
              value={serviceName}
              autoComplete="off"
              onChange={(event) => setServiceName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otel-endpoint">OTLP HTTP endpoint</Label>
            <Input
              id="otel-endpoint"
              value={endpoint}
              autoComplete="off"
              placeholder="https://otlp.example.com"
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otel-headers">Headers</Label>
            <Textarea
              id="otel-headers"
              value={headers}
              rows={2}
              autoComplete="off"
              placeholder="Authorization=Bearer …"
              onChange={(event) => setHeaders(event.target.value)}
              className="min-h-16 resize-none font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Standard <span className="font-medium">OTEL_EXPORTER_OTLP_HEADERS</span> form. Values are stored on the
              server, never shown again.
            </p>
          </div>
          {destination ? (
            <p className="truncate text-xs text-muted-foreground">Traces → {destination.traces}</p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={handleSave} disabled={saving}>
              Save destination
            </Button>
            <Button type="button" variant="outline" onClick={handleProbe} disabled={probing || !endpoint.trim()}>
              Send probe
            </Button>
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">Filters</h2>
          <Badge variant="muted">{savingFilters ? "Saving" : `${filters.filter((row) => row.enabled).length} on`}</Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Saved on the admin account. Enabled filters AND together across a trace — name, status, duration, span kind,
          or an attribute.
        </p>
        <FilterChips filters={filters} onToggle={toggleFilter} />
        <Separator className="my-4" />
        <FilterEditor
          filters={filters}
          onChange={(next) => void persistFilters(next)}
          draft={draft}
          onDraft={setDraft}
          onAdd={addFilter}
        />
      </section>

      <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">Live graph</h2>
          <div className="flex gap-1">
            {(["graph", "buffer"] as const).map((id) => (
              <Chip key={id} selected={view === id} data-view={id} onClick={() => setView(id)}>
                {id === "graph" ? "Graph" : "Buffer"}
              </Chip>
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Nodes are operations. Edges are parent → child. Tap a node to keep traces that include it.
        </p>

        {view === "graph" ? (
          <div className="mt-4 flex flex-col gap-5">
            <OperationMap
              graph={visibleOperations}
              activeName={activeOp ?? undefined}
              onSelect={(name) => setActiveOp((current) => (current === name ? null : name))}
            />
            {visibleGraphs.length === 0 ? null : (
              <>
                <div>
                  <p className="ds-kicker mb-2">Traces</p>
                  <div className="chip-scroll -mx-1 overflow-x-auto px-1">
                    <div className="flex w-max gap-2">
                      {visibleGraphs.slice(0, 12).map((graph) => (
                        <Chip
                          key={graph.traceId}
                          selected={current?.traceId === graph.traceId}
                          data-trace={graph.traceId}
                          onClick={() => setSelectedTrace(graph.traceId)}
                        >
                          {graph.name.replace(/^looktag\./, "")}
                          {graph.hasError ? " · err" : ""}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
                {current ? (
                  <div className="flex flex-col gap-4">
                    <TraceDag
                      graph={current}
                      selectedId={selectedSpan ?? undefined}
                      onSelect={setSelectedSpan}
                    />
                    <TraceWaterfall
                      graph={current}
                      selectedId={selectedSpan ?? undefined}
                      onSelect={setSelectedSpan}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mt-4 mb-3 flex gap-1">
              {(["all", "span", "metric", "log"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                    filter === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {id === "span" ? "traces" : id === "all" ? "all" : `${id}s`}
                </button>
              ))}
            </div>
            <Separator className="mb-2" />
            {visibleSignals.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No signals yet. Open the home feed, then come back.</p>
            ) : (
              <ul className="flex flex-col">
                {visibleSignals.map((row) => (
                  <li key={row.id} className="border-b border-border py-3 last:border-b-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.name}</p>
                        <p className="mt-0.5 truncate font-mono text-caption text-muted-foreground">
                          {row.kind === "span" && row.traceId
                            ? `${row.traceId.slice(0, 12)}${row.durationMs != null ? ` · ${row.durationMs} ms` : ""}`
                            : row.kind}
                        </p>
                      </div>
                      <Badge variant={row.status === "ERROR" ? "default" : "muted"}>
                        {row.kind === "span" ? row.status || "OK" : row.kind}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none tabular-nums">{value}</p>
    </div>
  );
}

function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border px-3 py-2.5 [&:has([data-state=checked])]:border-foreground">
      <span className="text-xs font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
