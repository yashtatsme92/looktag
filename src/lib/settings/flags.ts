import type { AppSettings } from "./model";

export type FeatureFlagKey = "shopWholeLookPhone";

export type FeatureFlag = {
  key: FeatureFlagKey & keyof AppSettings;
  label: string;
  helper: string;
  scope: string;
  default: boolean;
};

/** Admin "Feature flags" rows render from this list; a new flag needs only an entry here. */
export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  {
    key: "shopWholeLookPhone",
    label: "Show Shop whole look on phone",
    helper: "Adds a quiet Shop whole look link to the phone Shop sheet footer. Off by default.",
    scope: "Phone",
    default: false,
  },
];

export function flagStatus(on: boolean, flag: Pick<FeatureFlag, "default">): string {
  if (on) return "On";
  return flag.default ? "Off" : "Off · default";
}
