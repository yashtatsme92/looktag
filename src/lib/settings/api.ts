import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin/guard.server";
import { withSpan } from "@/lib/observability/instrument";
import { pickSettingsPatch, type AppSettings } from "./model";
import { readSettings, writeSettings } from "./store.server";

export const getAppSettings = createServerFn({ method: "GET" }).handler(async () => {
  return withSpan("looktag.settings.get", async (span) => {
    const settings = await readSettings();
    span.setAttribute("looktag.houses.enabled", settings.labelsEnabled);
    span.setAttribute("looktag.signup.email", settings.signupEmail);
    span.setAttribute("looktag.signup.google", settings.signupGoogle);
    span.setAttribute("looktag.signup.x", settings.signupX);
    span.setAttribute("looktag.theme", settings.themeId);
    return settings;
  });
});

export const saveAppSettings = createServerFn({ method: "POST" })
  .validator((input: Partial<AppSettings>) => pickSettingsPatch(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    return withSpan("looktag.settings.save", async (span) => {
      const settings = await writeSettings(data);
      span.setAttribute("looktag.houses.enabled", settings.labelsEnabled);
      span.setAttribute("looktag.theme", settings.themeId);
      span.setAttribute("looktag.splash", settings.splashId);
      return settings;
    });
  });
