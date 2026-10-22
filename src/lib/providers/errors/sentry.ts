import { appEnv } from "../telemetry/otlp.ts";
import type { ErrorContext, ErrorUser } from "./types";

type SentryClient = {
  init: (options: { dsn?: string; environment?: string }) => void;
  captureException: (error: unknown, hint?: { extra?: ErrorContext }) => void;
  captureMessage: (message: string, hint?: { extra?: ErrorContext }) => void;
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

export async function captureException(error: unknown, context?: ErrorContext): Promise<void> {
  const sentry = await client();
  sentry?.captureException(error, context ? { extra: context } : undefined);
}

export async function captureMessage(message: string, context?: ErrorContext): Promise<void> {
  const sentry = await client();
  sentry?.captureMessage(message, context ? { extra: context } : undefined);
}

export async function setUser(user: ErrorUser): Promise<void> {
  const sentry = await client();
  sentry?.setUser(user);
}
