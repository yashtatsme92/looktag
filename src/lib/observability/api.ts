import { createServerFn } from "@tanstack/react-start";
import { adminMiddleware } from "@/lib/auth/middleware";
import type { ObservabilityConfig, SignalKind } from "./model";
import { browserResourceFromClient } from "./resource";
import { createTraceFilter, parseTraceFilter, type TraceFilter } from "./graph";
import { parseClientSignals, ingestPayloadTooLarge } from "./client-signals";
import { registerIngestServerFn } from "./client-fetch";
import { clientIngestLimiter, resolveClientIp, trustProxyFromEnv } from "./ingest-limit";
import {
  ensureTelemetrySink,
  ingestSignals,
  listTraceBundle,
  probeOtlp,
  publicConfig,
  readConfig,
  writeConfig,
} from "./store.server";

const HEADER_KEEP = "__keep__";

export const getObservability = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
  ensureTelemetrySink();
  const config = await readConfig();
  const bundle = await listTraceBundle();
  return { config: publicConfig(config), ...bundle };
});

export const listObservabilitySignals = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator((input: { kind?: SignalKind }) => input)
  .handler(async ({ data }) => {
    ensureTelemetrySink();
    return listTraceBundle(data.kind);
  });

export const saveObservability = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((input: Partial<ObservabilityConfig> & { otlpHeaders?: string; filters?: TraceFilter[] }) => input)
  .handler(async ({ data }) => {
    const patch: Partial<ObservabilityConfig> = { ...data };
    if (data.otlpHeaders === HEADER_KEEP) delete patch.otlpHeaders;
    if (data.filters) {
      patch.filters = data.filters.map(parseTraceFilter).filter((row): row is TraceFilter => Boolean(row));
    }
    const config = await writeConfig(patch);
    return publicConfig(config);
  });

export const saveObservabilityFilters = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((input: { filters: TraceFilter[] }) => input)
  .handler(async ({ data }) => {
    const filters = data.filters.map((row) => createTraceFilter(row));
    const config = await writeConfig({ filters });
    return publicConfig(config);
  });

export const probeObservability = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async () => {
    const config = await readConfig();
    return probeOtlp(config);
  });

export const ingestClientSignals = createServerFn({ method: "POST" })
  .validator((input: { signals?: unknown; resource?: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const ip = await clientIp();
    if (!clientIngestLimiter.allow(ip)) {
      await respond(429);
      return { accepted: 0 };
    }
    if (ingestPayloadTooLarge(data) || (await contentLengthTooLarge())) {
      await respond(413);
      return { accepted: 0 };
    }
    const signals = parseClientSignals(data?.signals);
    if (!signals) {
      await respond(400);
      return { accepted: 0 };
    }
    ensureTelemetrySink();
    const resource = browserResourceFromClient(data?.resource);
    if (resource) {
      for (const signal of signals) signal.resourceAttributes = resource;
    }
    const accepted = await ingestSignals(signals);
    return { accepted };
  });

async function contentLengthTooLarge(): Promise<boolean> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const raw = getRequestHeader("content-length");
    const length = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(length) && length > 64 * 1024;
  } catch {
    return false;
  }
}

async function clientIp(): Promise<string> {
  try {
    const { getRequestIP, getRequestHeader } = await import("@tanstack/react-start/server");
    return resolveClientIp({
      trustProxy: trustProxyFromEnv(),
      forwardedFor: getRequestHeader("x-forwarded-for"),
      socketIp: getRequestIP(),
    });
  } catch {
    return "unknown";
  }
}

async function respond(status: number): Promise<void> {
  try {
    const { setResponseStatus } = await import("@tanstack/react-start/server");
    setResponseStatus(status);
  } catch {
    // The accepted count is still zero when status cannot be set.
  }
}

export const HEADER_KEEP_VALUE = HEADER_KEEP;

registerIngestServerFn((ingestClientSignals as { url?: string }).url);
