/**
 * PostHog init options. The SDK is not loaded until consent is granted, so the
 * live config uses localStorage+cookie. Memory is the pre-consent state: no SDK.
 */
export function posthogInitConfig(consentGranted: boolean) {
  return {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    persistence: consentGranted ? "localStorage+cookie" : "memory",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    capture_exceptions: true,
    capture_performance: {
      web_vitals: true,
      web_vitals_allowed_metrics: ["LCP", "INP", "CLS", "FCP"] as Array<"LCP" | "INP" | "CLS" | "FCP">,
    },
    disable_session_recording: true,
    ip: false,
  };
}

export type PosthogInitConfig = ReturnType<typeof posthogInitConfig>;
