import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  FOOTER_LINK_IDS,
  FOOTER_LINK_LABELS,
  parseFooterIds,
  toggleFooterId,
  type FooterLink,
  type FooterLinkId,
} from "@/config/footer";
import { memoPromise } from "@/lib/loading/memo-promise";
import { useSettingsStore } from "@/lib/settings/store";
import { getSiteConfig } from "@/lib/site/api";

/** Admin: one on/off switch per footer link. Every link ships off. */
export function FooterLinksSection() {
  const footerLinks = useSettingsStore((s) => s.footerLinks);
  const save = useSettingsStore((s) => s.save);
  const [catalog, setCatalog] = useState<FooterLink[]>([]);
  const [state, setState] = useState<Partial<Record<FooterLinkId, "saving" | "saved" | "error">>>({});

  useEffect(() => {
    void memoPromise("site-config", () => getSiteConfig()).then((c) => setCatalog(c.footer)).catch(() => {});
  }, []);

  const on = new Set(parseFooterIds(footerLinks, () => {}));

  async function toggle(id: FooterLinkId, next: boolean) {
    setState((s) => ({ ...s, [id]: "saving" }));
    try {
      await save({ footerLinks: toggleFooterId(useSettingsStore.getState().footerLinks, id, next) });
      setState((s) => ({ ...s, [id]: "saved" }));
      window.setTimeout(() => setState((s) => ({ ...s, [id]: undefined })), 1650);
    } catch {
      setState((s) => ({ ...s, [id]: "error" }));
    }
  }

  return (
    <section className="flag-section" aria-labelledby="footer-links-title" data-testid="footer-links">
      <h2 className="flag-section-title" id="footer-links-title">Footer links</h2>
      <p className="flag-section-intro">
        The footer is always on. Switch each link on when its page or account is ready. All links start off.
      </p>
      <div className="flag-list">
        {FOOTER_LINK_IDS.map((id) => {
          const link = catalog.find((item) => item.id === id);
          const envOn = Boolean(link?.enabled);
          const checked = envOn || on.has(id);
          const missingHref = Boolean(link) && !link?.href;
          const label = FOOTER_LINK_LABELS[id];
          const phase = state[id];
          const status =
            phase === "saving" ? "Saving…"
            : phase === "saved" ? "Saved"
            : phase === "error" ? "Could not save."
            : envOn ? "On · set by FOOTER_LINKS_ENABLED"
            : missingHref ? (checked ? "On · hidden until its URL is set" : "Off · URL not set")
            : checked ? "On" : "Off · default";
          return (
            <article className="flag-row" key={id} data-testid={`footer-link-${id}`}>
              <div className="flag-row-copy">
                <span className="flag-row-name">{label}</span>
                {link?.href ? <span className="flag-row-helper">{link.href}</span> : null}
                <span className="flag-row-meta">
                  <span className="flag-row-state" aria-live="polite">{status}</span>
                </span>
              </div>
              <Switch
                checked={checked}
                disabled={envOn}
                aria-label={`Footer link: ${label}`}
                onCheckedChange={(next) => void toggle(id, next)}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
