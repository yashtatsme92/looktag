import type { Look } from "./types";

export const MOODS = [
  { id: "tailored", label: "Tailored" },
  { id: "evening", label: "Evening" },
  { id: "knit", label: "Knit" },
  { id: "coastal", label: "Coastal" },
] as const;

export type MoodId = (typeof MOODS)[number]["id"];

export function looksForMood(looks: Look[], mood: MoodId | null): Look[] {
  if (!mood) return looks;
  return looks.filter((look) => look.moods?.includes(mood));
}

export function moodLabel(id: string): string {
  return MOODS.find((mood) => mood.id === id)?.label ?? id;
}
