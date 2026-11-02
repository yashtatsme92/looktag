const attempts = new Map<string, number[]>();

export const CLIENT_SIGNAL_INGEST_LIMIT = 60;
export const CLIENT_SIGNAL_INGEST_MAX_CLIENTS = 4096;

function pruneExpired(now: number, windowMs: number, store: Map<string, number[]>): void {
  for (const [key, timestamps] of store) {
    const recent = timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (recent.length === 0) store.delete(key);
    else if (recent.length !== timestamps.length) store.set(key, recent);
  }
}

export function allowClientSignalIngest(
  clientIp: string,
  now = Date.now(),
  limit = CLIENT_SIGNAL_INGEST_LIMIT,
  windowMs = 60_000,
  store: Map<string, number[]> = attempts,
  maxClients = CLIENT_SIGNAL_INGEST_MAX_CLIENTS,
): boolean {
  pruneExpired(now, windowMs, store);
  const recent = store.get(clientIp);
  if (recent && recent.length >= limit) return false;
  if (!recent && store.size >= maxClients) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  const next = recent ?? [];
  next.push(now);
  store.set(clientIp, next);
  return true;
}

export class ClientSignalIngestRateLimitError extends Error {
  readonly status = 429;
  constructor() {
    super("Too many telemetry requests.");
    this.name = "ClientSignalIngestRateLimitError";
  }
}
