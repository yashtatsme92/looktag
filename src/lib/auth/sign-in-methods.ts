import { createServerFn } from "@tanstack/react-start";
import type { SignInMethodView } from "@/lib/providers/auth/types";

export type { SignInMethodView };

/** Server-owned list of buttons the login page may show. No secrets. */
export const getSignInMethods = createServerFn({ method: "GET" }).handler(async () => {
  const { readSettings } = await import("@/lib/settings/store.server");
  const { listVisibleSignInMethods } = await import("@/lib/providers/auth/methods");
  const settings = await readSettings();
  return listVisibleSignInMethods(process.env, settings);
});
