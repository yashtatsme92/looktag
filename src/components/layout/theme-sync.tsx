import { useEffect } from "react";
import { parseThemeId, THEME_STORAGE_KEY, themeColor, type ThemeId } from "@/lib/design/themes";
import { parseSplashId, writeStoredSplash, type SplashId } from "@/lib/pwa/splash";
import { useSettingsStore } from "@/lib/settings/store";

function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  const theme = parseThemeId(id);
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColor(theme));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
}

function applySplash(id: SplashId) {
  writeStoredSplash(parseSplashId(id));
}

export function ThemeSync() {
  const themeId = useSettingsStore((s) => s.themeId);
  const splashId = useSettingsStore((s) => s.splashId);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const hydrate = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    applyTheme(themeId);
  }, [hydrated, themeId]);

  useEffect(() => {
    if (!hydrated) return;
    applySplash(splashId);
  }, [hydrated, splashId]);

  return null;
}
