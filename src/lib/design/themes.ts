export const THEME_IDS = [
  "ink",
  "paper",
  "night",
  "snow",
  "stone",
  "carbon",
  "slate",
  "bone",
  "navy",
  "moss",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "ink";

export const THEMES: {
  id: ThemeId;
  name: string;
  note: string;
  ground: string;
  ink: string;
}[] = [
  { id: "ink", name: "Ink", note: "Grey ground, black type.", ground: "#f4f4f4", ink: "#111111" },
  { id: "paper", name: "Paper", note: "Warm newsprint.", ground: "#f3efe6", ink: "#1c1914" },
  { id: "night", name: "Night", note: "Dark room, light type.", ground: "#121212", ink: "#ececec" },
  { id: "snow", name: "Snow", note: "Cool white, slate type.", ground: "#f7f8fa", ink: "#1a1f24" },
  { id: "stone", name: "Stone", note: "Taupe ground, charcoal type.", ground: "#eeeae4", ink: "#2a2622" },
  { id: "carbon", name: "Carbon", note: "Near-black studio.", ground: "#0b0b0b", ink: "#e8e8e8" },
  { id: "slate", name: "Slate", note: "Cool blue-grey.", ground: "#e7ebf0", ink: "#161c24" },
  { id: "bone", name: "Bone", note: "Ivory, tobacco type.", ground: "#f7f3ea", ink: "#241e16" },
  { id: "navy", name: "Navy", note: "Deep blue room.", ground: "#0c121c", ink: "#e8eef6" },
  { id: "moss", name: "Moss", note: "Olive ground, forest type.", ground: "#eceee6", ink: "#1a1f16" },
];

export function parseThemeId(value: unknown): ThemeId {
  return THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : DEFAULT_THEME;
}

export const THEME_STORAGE_KEY = "looktag-theme-v1";

export function themeColor(id: ThemeId): string {
  return THEMES.find((theme) => theme.id === id)?.ground ?? THEMES[0].ground;
}
