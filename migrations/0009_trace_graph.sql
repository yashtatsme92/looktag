-- Graph traces: parent links plus admin-configurable filter bag.
-- extras_json keeps unknown future keys the same way looktag_settings does.

alter table observability_settings
  add column if not exists extras_json text not null default '{}';

alter table telemetry_signals
  add column if not exists parent_span_id text;

create index if not exists telemetry_signals_parent_idx
  on telemetry_signals (parent_span_id);
