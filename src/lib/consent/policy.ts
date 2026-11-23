/** Consent decision rules. The server cookie is the source of truth. */

import type { ConsentRegion } from "./region.ts";

export const CONSENT_POLICY_VERSION = 1;
export const CONSENT_MAX_AGE_SECONDS = 31_536_000;

export const CONSENT_COOKIE = "lt_consent";
export const CONSENT_BASIS_COOKIE = "lt_consent_basis";
export const CONSENT_AT_COOKIE = "lt_consent_at";
export const CONSENT_VERSION_COOKIE = "lt_consent_v";
export const REGION_COOKIE = "lt_region";

export type ConsentValue = "granted" | "denied";
export type ConsentBasis = "explicit" | "notice" | "gpc";
export type BannerKind = "opt-in" | "notice" | "gpc" | "india";
export type ConsentAction =
  | "accept"
  | "decline"
  | "opt-out"
  | "ok"
  | "seen"
  | "gpc-ok"
  | "save-on"
  | "save-off";

export type StoredConsent = {
  value: ConsentValue | null;
  basis: ConsentBasis | null;
  at: string | null;
  version: number | null;
};

export type ConsentView = {
  region: ConsentRegion;
  load: boolean;
  banner: BannerKind | null;
  /** US / rest of world may boot after the notice has been seen, before OK. */
  pendingSeen: boolean;
  stored: StoredConsent;
  effectiveValue: ConsentValue | null;
  effectiveBasis: ConsentBasis | null;
};

const VALUES = new Set<ConsentValue>(["granted", "denied"]);
const BASES = new Set<ConsentBasis>(["explicit", "notice", "gpc"]);

export function emptyConsent(): StoredConsent {
  return { value: null, basis: null, at: null, version: null };
}

export function parseStoredConsent(input: {
  consent?: string | null;
  basis?: string | null;
  at?: string | null;
  version?: string | number | null;
}): StoredConsent {
  const value = input.consent?.trim();
  const basis = input.basis?.trim();
  const versionRaw = input.version == null ? "" : String(input.version).trim();
  const version = /^\d+$/.test(versionRaw) ? Number(versionRaw) : null;
  return {
    value: value && VALUES.has(value as ConsentValue) ? (value as ConsentValue) : null,
    basis: basis && BASES.has(basis as ConsentBasis) ? (basis as ConsentBasis) : null,
    at: input.at?.trim() || null,
    version,
  };
}

/** A stored choice is stale, or a notice-only grant is not enough for EU / India. */
export function needsReask(stored: StoredConsent, region: ConsentRegion): boolean {
  if (!stored.value || stored.version == null) return true;
  if (stored.version < CONSENT_POLICY_VERSION) return true;
  if ((region === "eu" || region === "in") && stored.basis === "notice") return true;
  return false;
}

/**
 * GPC flips a notice-based grant to denied. An explicit On or Off is kept,
 * including an explicit On saved while GPC stays on.
 */
export function gpcOverrides(stored: StoredConsent, gpc: boolean): boolean {
  if (!gpc) return false;
  return stored.basis === "notice" && stored.value === "granted";
}

export function consentView(input: {
  region: ConsentRegion;
  stored: StoredConsent;
  gpc: boolean;
}): ConsentView {
  const { region, stored, gpc } = input;
  if (!needsReask(stored, region) && gpcOverrides(stored, gpc)) {
    return {
      region,
      stored,
      load: false,
      banner: "gpc",
      pendingSeen: false,
      effectiveValue: "denied",
      effectiveBasis: "gpc",
    };
  }
  if (!needsReask(stored, region) && stored.value) {
    return {
      region,
      stored,
      load: stored.value === "granted",
      banner: null,
      pendingSeen: false,
      effectiveValue: stored.value,
      effectiveBasis: stored.basis,
    };
  }
  if ((region === "us" || region === "row") && gpc) {
    return {
      region,
      stored,
      load: false,
      banner: "gpc",
      pendingSeen: false,
      effectiveValue: null,
      effectiveBasis: null,
    };
  }
  if (region === "in") {
    return {
      region,
      stored,
      load: false,
      banner: "india",
      pendingSeen: false,
      effectiveValue: null,
      effectiveBasis: null,
    };
  }
  if (region === "eu") {
    return {
      region,
      stored,
      load: false,
      banner: "opt-in",
      pendingSeen: false,
      effectiveValue: null,
      effectiveBasis: null,
    };
  }
  return {
    region,
    stored,
    load: false,
    banner: "notice",
    pendingSeen: true,
    effectiveValue: null,
    effectiveBasis: null,
  };
}

export function decisionForAction(
  action: ConsentAction,
): { value: ConsentValue; basis: ConsentBasis } {
  switch (action) {
    case "accept":
    case "save-on":
      return { value: "granted", basis: "explicit" };
    case "decline":
    case "opt-out":
    case "save-off":
      return { value: "denied", basis: "explicit" };
    case "ok":
    case "seen":
      return { value: "granted", basis: "notice" };
    case "gpc-ok":
      return { value: "denied", basis: "gpc" };
  }
}

export function formatConsentDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export type ChoiceStatus = {
  text: string;
  emphasis: "Off" | "On" | null;
};

/** Status line inside Privacy choices. */
export function choiceStatus(view: ConsentView): ChoiceStatus {
  const { region, stored } = view;
  if (
    view.banner === "gpc" ||
    view.effectiveBasis === "gpc" ||
    (!needsReask(stored, region) && stored.basis === "gpc")
  ) {
    return { text: "Your choice: Off, set by your browser's privacy signal.", emphasis: "Off" };
  }
  if (!needsReask(stored, region) && stored.basis === "explicit" && stored.value === "denied") {
    const date = formatConsentDate(stored.at);
    return { text: `Your choice: Off, set ${date}`.trim(), emphasis: "Off" };
  }
  if (!needsReask(stored, region) && stored.basis === "explicit" && stored.value === "granted") {
    const date = formatConsentDate(stored.at);
    return { text: `Your choice: On, set ${date}`.trim(), emphasis: "On" };
  }
  if (!needsReask(stored, region) && stored.basis === "notice" && stored.value === "granted") {
    return { text: "Your choice: On (default). Choose Off to opt out.", emphasis: "On" };
  }
  if (region === "eu" || region === "in") {
    return { text: "Not set. Analytics is off.", emphasis: null };
  }
  return { text: "Not set. Analytics is off until you've seen the notice.", emphasis: null };
}
