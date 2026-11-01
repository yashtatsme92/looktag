let exportErrors = 0;

export function otlpExportErrorCount(): number {
  return exportErrors;
}

export function recordOtlpExportError(): void {
  exportErrors += 1;
}

/** Export helper. Failures increment a counter and never reject. Headers are not logged. */
export async function deliverOtlp(send: () => Promise<unknown>): Promise<void> {
  try {
    await send();
  } catch {
    recordOtlpExportError();
  }
}
