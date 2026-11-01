import { appEnv } from "../telemetry/otlp.ts";
import type { ErrorContext, ErrorUser } from "./types";

type SentryClient = {
  init: (options: { dsn?: string; environment?: string }) => void;
  captureException: (error: unknown, hint?: { extra?: ErrorContext; tags?: Record<string, string> }) => void;
  captureMessage: (message: string, hint?: { extra?: ErrorContext; tags?: Record<string, string> }) => void;
  setUser: (user: { id?: string; email?: string } | null) => void;
};

let nodeClient: Promise<SentryClient | null> | null = null;
let reactClient: Promise<SentryClient | null> | null = null;

async function load(kind: "node" | "react"): Promise<SentryClient | null> {
  const name = kind === "node" ? "@sentry/node" : "@sentry/react";
  try {
    const mod = (await import(/* @vite-ignore */ name)) as SentryClient;
    const dsn = process.env.SENTRY_DSN?.trim();
    if (!dsn) return null;
    mod.init({
      dsn,
      environment: appEnv(),
    });
    return mod;
  } catch (error) {
    console.error("[errors] Sentry SDK failed to load", error);
    return null;
  }
}

function client(): Promise<SentryClient | null> {
  if (typeof window === "undefined") {
    nodeClient ??= load("node");
    return nodeClient;
  }
  reactClient ??= load("react");
  return reactClient;
}

function traceTags(context?: ErrorContext): Record<string, string> | undefined {
  const tags: Record<string, string> = {};
  if (typeof context?.trace_id === "string") tags.trace_id = context.trace_id;
  if (typeof context?.span_id === "string") tags.span_id = context.span_id;
  if (typeof context?.request_id === "string") tags.request_id = context.request_id;
  return Object.keys(tags).length > 0 ? tags : undefined;
}

export async function captureException(error: unknown, context?: ErrorContext): Promise<void> {
  const sentry = await client();
  const tags = traceTags(context);
  sentry?.captureException(error, tags ? { extra: context, tags } : context ? { extra: context } : undefined);
}

export async function captureMessage(message: string, context?: ErrorContext): Promise<void> {
  const sentry = await client();
  const tags = traceTags(context);
  sentry?.captureMessage(message, tags ? { extra: context, tags } : context ? { extra: context } : undefined);
}

export async function setUser(user: ErrorUser): Promise<void> {
  const sentry = await client();
  sentry?.setUser(user);
}
