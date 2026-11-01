import { useEffect, useState } from "react";
import { parseFooterIds, visibleFooterLinks, type FooterLink } from "@/config/footer";
import { memoPromise } from "@/lib/loading/memo-promise";
import { useSettingsStore } from "@/lib/settings/store";
import { getSiteConfig } from "@/lib/site/api";
import { setPublicOrigin } from "@/lib/site/public-url";

/**
 * Site footer. Always rendered; shows only links that are switched on.
 * With nothing on it is an empty, zero-height landmark (no gaps, no shift).
 */
export function SiteFooter() {
  const adminIds = useSettingsStore((s) => s.footerLinks);
  const [catalog, setCatalog] = useState<FooterLink[]>([]);

  useEffect(() => {
    let live = true;
    void memoPromise("site-config", () => getSiteConfig())
      .then((config) => {
        setPublicOrigin(config.appUrl);
        if (live) setCatalog(config.footer);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const adminOn = new Set(parseFooterIds(adminIds, () => {}));
  const links = visibleFooterLinks(
    catalog.map((link) => ({ ...link, enabled: link.enabled || adminOn.has(link.id) })),
  );

  return (
    <footer className="site-footer" data-testid="site-footer" data-links={links.length}>
      {links.length > 0 ? (
        <nav aria-label="Footer">
          <ul className="site-footer-list">
            {links.map((link) => (
              <li key={link.id}>
                <a
                  href={link.href}
                  data-footer-link={link.id}
                  {...(link.external && !link.href.startsWith("mailto:")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </footer>
  );
}
