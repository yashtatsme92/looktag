-- Vendor-agnostic telemetry: OTLP settings plus a local signal buffer.
-- Any OpenTelemetry collector (Grafana Tempo, Jaeger, Honeycomb, Datadog,
-- New Relic, Lightstep, Dash0, …) can read the same OTLP/HTTP JSON.

create table if not exists observability_settings (
  id               text primary key,
  enabled          boolean not null default true,
  traces_enabled   boolean not null default true,
  metrics_enabled  boolean not null default true,
  logs_enabled     boolean not null default true,
  service_name     text not null default 'looktag',
  otlp_endpoint    text not null default '',
  otlp_headers     text not null default '',
  sample_ratio     double precision not null default 1,
  updated_at       bigint not null
);

create table if not exists telemetry_signals (
  id              text primary key,
  kind            text not null,
  name            text not null,
  status          text not null default '',
  trace_id        text,
  span_id         text,
  duration_ms     integer,
  start_time      bigint not null,
  attributes_json text not null default '{}',
  payload_json    text not null default '{}',
  created_at      bigint not null
);

create index if not exists telemetry_signals_created_idx
  on telemetry_signals (created_at desc);

create index if not exists telemetry_signals_kind_created_idx
  on telemetry_signals (kind, created_at desc);

create index if not exists telemetry_signals_trace_idx
  on telemetry_signals (trace_id);
