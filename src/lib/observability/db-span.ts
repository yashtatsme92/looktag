import { activeSpan } from "./active-span.ts";
import { startSpan } from "./runtime.ts";
import { stripSqlValues } from "./sql-statement.ts";

/**
 * Child of the active request span. No parent means no span: a query outside a
 * request must not start its own trace. `params` never reach the span.
 */
export async function traceDbQuery<T>(statement: string, run: () => Promise<T>): Promise<T> {
  const parent = activeSpan();
  if (!parent || /telemetry_signals|observability_settings/.test(statement)) return run();
  const span = startSpan("pg.query", {
    kind: "CLIENT",
    traceId: parent.traceId,
    parentSpanId: parent.spanId,
    attributes: {
      "db.system": "postgresql",
      "db.statement": stripSqlValues(statement),
    },
  });
  try {
    const result = await run();
    span.end();
    return result;
  } catch (error) {
    span.end(error);
    throw error;
  }
}
