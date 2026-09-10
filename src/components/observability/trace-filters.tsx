import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Chip, Field } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  FILTER_FIELDS,
  OPS_FOR_FIELD,
  createTraceFilter,
  filterLabel,
  type FilterField,
  type FilterOp,
  type TraceFilter,
} from "@/lib/observability/graph";

export function FilterChips({
  filters,
  onToggle,
}: {
  filters: TraceFilter[];
  onToggle: (id: string) => void;
}) {
  if (filters.length === 0) {
    return <p className="text-sm text-muted-foreground">No filters yet. Add one below.</p>;
  }
  return (
    <div className="chip-scroll -mx-1 overflow-x-auto px-1" role="group" aria-label="Trace filters">
      <div className="flex w-max gap-2">
        {filters.map((filter) => (
          <Chip
            key={filter.id}
            selected={filter.enabled}
            data-filter={filter.id}
            onClick={() => onToggle(filter.id)}
          >
            {filterLabel(filter)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function FilterEditor({
  filters,
  onChange,
  draft,
  onDraft,
  onAdd,
}: {
  filters: TraceFilter[];
  onChange: (next: TraceFilter[]) => void;
  draft: TraceFilter;
  onDraft: (next: TraceFilter) => void;
  onAdd: () => void;
}) {
  function patch(id: string, next: Partial<TraceFilter>) {
    onChange(filters.map((row) => (row.id === id ? createTraceFilter({ ...row, ...next, id: row.id }) : row)));
  }

  return (
    <div className="flex flex-col gap-4" data-filter-editor="true">
      <ul className="flex flex-col gap-3">
        {filters.map((filter) => (
          <li key={filter.id} className="rounded-lg border border-border px-3 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="flex min-h-11 items-center gap-3">
                <Switch
                  checked={filter.enabled}
                  onCheckedChange={(enabled) => patch(filter.id, { enabled })}
                  aria-label={`Enable ${filterLabel(filter)}`}
                />
                <span className="text-sm font-medium">{filter.label}</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${filter.label}`}
                onClick={() => onChange(filters.filter((row) => row.id !== filter.id))}
              >
                <Trash2 />
              </Button>
            </div>
            <FilterFields
              filter={filter}
              onChange={(next) => patch(filter.id, next)}
            />
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-dashed border-border px-3 py-3">
        <p className="ds-kicker mb-3">New filter</p>
        <FilterFields filter={draft} onChange={(next) => onDraft(createTraceFilter({ ...draft, ...next, id: draft.id }))} />
        <Button type="button" variant="outline" className="mt-3" onClick={onAdd}>
          <Plus />
          Add filter
        </Button>
      </div>
    </div>
  );
}

function FilterFields({
  filter,
  onChange,
}: {
  filter: TraceFilter;
  onChange: (next: Partial<TraceFilter>) => void;
}) {
  const ops = OPS_FOR_FIELD[filter.field] ?? OPS_FOR_FIELD.name;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Label" htmlFor={`flt-label-${filter.id}`}>
        <Input
          id={`flt-label-${filter.id}`}
          value={filter.label}
          autoComplete="off"
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </Field>
      <Field label="Field" htmlFor={`flt-field-${filter.id}`}>
        <NativeSelect
          id={`flt-field-${filter.id}`}
          value={filter.field}
          onChange={(value) => {
            const field = value as FilterField;
            const nextOps = OPS_FOR_FIELD[field];
            onChange({
              field,
              op: nextOps.includes(filter.op) ? filter.op : nextOps[0],
            });
          }}
        >
          {FILTER_FIELDS.map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Match" htmlFor={`flt-op-${filter.id}`}>
        <NativeSelect
          id={`flt-op-${filter.id}`}
          value={filter.op}
          onChange={(value) => onChange({ op: value as FilterOp })}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {filter.field === "attribute" ? (
        <Field label="Attribute key" htmlFor={`flt-attr-${filter.id}`}>
          <Input
            id={`flt-attr-${filter.id}`}
            value={filter.attrKey ?? ""}
            autoComplete="off"
            placeholder="rpc.method"
            onChange={(event) => onChange({ attrKey: event.target.value })}
          />
        </Field>
      ) : null}
      <Field label="Value" htmlFor={`flt-value-${filter.id}`}>
        <Input
          id={`flt-value-${filter.id}`}
          value={filter.value}
          autoComplete="off"
          placeholder={filter.field === "durationMs" ? "100" : "looktag.looks"}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      </Field>
    </div>
  );
}

function NativeSelect({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base text-foreground shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}
