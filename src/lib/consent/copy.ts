/** Locked consent copy. Do not paraphrase. */

import type { BannerKind } from "./policy.ts";
import type { ConsentRegion } from "./region.ts";

export const PRIVACY_POLICY_LABEL = "Privacy policy";

export const TOAST_ACCEPT = "Thanks. Analytics is on.";
export const TOAST_DECLINE = "Got it. Analytics stays off.";
export const TOAST_OPT_OUT = "You've opted out of analytics.";
export const TOAST_SAVED_OFF = "Saved. Analytics is off.";
export const TOAST_SAVED_ON = "Saved. Analytics is on.";

export const INDIA_ITEMS = [
  "Pages and looks you open",
  "Taps like Save, Follow, Shop and Share",
  "Device type, browser, screen size and page speed",
  "Your Looktag account ID if signed in, never your name or email",
] as const;

export type BannerCopy = {
  title: string;
  /** Full body. Empty on compact look surfaces. */
  body: string;
  /** Compact look line, without the Details link. */
  line: string;
  /** Wide look-bar sentence after the title. */
  strip: string;
  primary: string;
  secondary: string;
  /** Compact India uses Review instead of Accept. */
  review?: boolean;
  privacyOnStrip: boolean;
};

const EU_PHONE =
  "We'd like to use PostHog analytics, hosted in the EU, to see which looks get used. No ad trackers, no selling data. Nothing runs unless you accept.";
const EU_WIDE =
  "We'd like to use PostHog analytics, hosted in the EU, to see which looks and pages get used so we can improve Looktag. No ad trackers, and we don't sell your data. Nothing is collected unless you accept.";
const US_PHONE =
  "We use PostHog analytics, hosted in the EU, to see which looks get used. No ad trackers; we don't sell or share your data. Opt out any time.";
const US_WIDE =
  "Looktag uses PostHog analytics, hosted in the EU, to see which looks and pages get used. No ad trackers, and we don't sell or share your data. You can opt out now or any time in Privacy choices.";
const ROW_PHONE =
  "We use PostHog analytics, hosted in the EU, to see which looks get used. No ad trackers, and we don't sell your data. Opt out any time.";
const ROW_WIDE =
  "Looktag uses PostHog analytics, hosted in the EU, to see which looks and pages get used. No ad trackers, and we don't sell your data. You can opt out now or any time in Privacy choices.";
const GPC_PHONE =
  "Your browser's privacy signal is on, so analytics is off. Nothing is collected. You can change this in Privacy choices.";
const GPC_WIDE =
  "Your browser's privacy signal is on, so analytics is off. Nothing is collected. You can change this any time in Privacy choices.";
const INDIA_LEAD =
  "With your consent, Looktag uses PostHog analytics, hosted in the EU, only to understand how Looktag is used and improve it. We'd collect:";
const INDIA_AFTER =
  "Withdraw any time in Privacy choices, as easily as you gave it. Our Privacy policy explains your rights and how to complain, including to the Data Protection Board of India.";

export function bannerCopy(kind: BannerKind, region: ConsentRegion, phone: boolean): BannerCopy {
  if (kind === "gpc") {
    return {
      title: "Analytics is off",
      body: phone ? GPC_PHONE : GPC_WIDE,
      line: "Your browser's privacy signal is on, so analytics is off.",
      strip: "Your browser's privacy signal is on, so analytics is off.",
      secondary: "Privacy choices",
      primary: "OK",
      privacyOnStrip: true,
    };
  }
  if (kind === "india") {
    return {
      title: "Your consent for analytics",
      body: INDIA_LEAD,
      line: "Analytics (PostHog, EU) only with your consent.",
      strip: "Analytics (PostHog, EU) only with your consent.",
      secondary: "Decline",
      primary: "Accept",
      review: true,
      privacyOnStrip: false,
    };
  }
  if (kind === "notice") {
    const row = region === "row";
    return {
      title: "We use analytics",
      body: phone ? (row ? ROW_PHONE : US_PHONE) : row ? ROW_WIDE : US_WIDE,
      line: "We use PostHog analytics (EU). No ad trackers.",
      strip: "We use PostHog analytics (EU). No ad trackers.",
      secondary: "Opt out",
      primary: "OK",
      privacyOnStrip: true,
    };
  }
  return {
    title: "Can we use analytics?",
    body: phone ? EU_PHONE : EU_WIDE,
    line: "PostHog analytics (EU), only if you accept.",
    strip: "PostHog analytics (EU), only if you accept.",
    secondary: "Decline",
    primary: "Accept",
    privacyOnStrip: true,
  };
}

export const CHOICES_TITLE = "Privacy choices";
export const CHOICES_BODY = "Choose whether Looktag may use analytics. No ad trackers, and we don't sell your data.";
export const ESSENTIAL_NAME = "Essential";
export const ESSENTIAL_STATE = "Always on";
export const ESSENTIAL_DESC = "Keeps you signed in and remembers this choice.";
export const ANALYTICS_NAME = "Analytics";
export const ANALYTICS_DESC = "PostHog, hosted in the EU. Shows us which looks and pages get used.";
export const INDIA_AFTER_COPY = INDIA_AFTER;
