import { createServerFn } from "@tanstack/react-start";
import { configuredOrigin } from "@/lib/share-meta";
import { contactEmail, resolveFooterLinks, type FooterLink } from "@/config/footer";

export type SiteConfig = {
  /** Every footer link; `enabled` reflects FOOTER_LINKS_ENABLED only (Admin toggles merge on the client). */
  footer: FooterLink[];
  contactEmail: string;
  /** Canonical public origin from APP_URL ("" when unset). */
  appUrl: string;
};

/** Public, env-derived site config. Holds no secrets. */
export const getSiteConfig = createServerFn({ method: "GET" }).handler(async (): Promise<SiteConfig> => {
  return {
    footer: resolveFooterLinks({ adminIds: "", env: process.env }),
    contactEmail: contactEmail(process.env),
    appUrl: configuredOrigin(),
  };
});

/** Server-side: is this footer link on (Admin or env)? Used to gate legal pages. */
export const isFooterLinkOn = createServerFn({ method: "GET" })
  .validator((id: string) => String(id))
  .handler(async ({ data }) => {
    const { readSettings } = await import("@/lib/settings/store.server");
    const settings = await readSettings();
    const link = resolveFooterLinks({ adminIds: settings.footerLinks, env: process.env }).find(
      (item) => item.id === data,
    );
    return { on: Boolean(link?.enabled), contactEmail: contactEmail(process.env) };
  });
