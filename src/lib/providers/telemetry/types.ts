export type TelemetryProviderName = "otlp" | "none";

export interface TelemetryProvider {
  readonly name: TelemetryProviderName;
  environment(): string;
}
