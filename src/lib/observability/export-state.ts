/** In-memory stamp of the last successful OTLP export. No schema change. */

let lastExport = "";

export function markExportSuccess(at = new Date().toISOString()): string {
  lastExport = at;
  return lastExport;
}

export function currentLastExport(): string {
  return lastExport;
}

/** Stamp lastExport only when at least one collector POST succeeded. */
export function noteExportResults(oks: boolean[], at = new Date().toISOString()): string {
  if (oks.some(Boolean)) return markExportSuccess(at);
  return lastExport;
}

export function resetExportState(): void {
  lastExport = "";
}
