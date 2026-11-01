import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FOOTER_LINK_IDS,
  contactEmail,
  parseFooterIds,
  resolveFooterLinks,
  toggleFooterId,
  visibleFooterLinks,
} from "./footer.ts";

const ENV = {
  APP_URL: "https://thelooktag.com",
  FOOTER_INSTAGRAM_URL: "https://instagram.com/looktag",
  FOOTER_TIKTOK_URL: "https://tiktok.com/@looktag",
  FOOTER_X_URL: "https://x.com/looktag",
};

describe("footer links", () => {
  it("all off by default", () => {
    const links = resolveFooterLinks({ env: { ...ENV } });
    assert.equal(links.length, FOOTER_LINK_IDS.length);
    assert.ok(links.every((l) => !l.enabled));
    assert.deepEqual(visibleFooterLinks(links), []);
  });

  it("some on via admin toggles", () => {
    const links = visibleFooterLinks(resolveFooterLinks({ adminIds: "privacy,contact", env: { ...ENV } }));
    assert.deepEqual(links.map((l) => l.id), ["privacy", "contact"]);
    assert.equal(links[1].href, "mailto:hello@thelooktag.com");
  });

  it("all on", () => {
    const links = visibleFooterLinks(resolveFooterLinks({ adminIds: FOOTER_LINK_IDS.join(","), env: { ...ENV } }));
    assert.equal(links.length, FOOTER_LINK_IDS.length);
    const domain = links.find((l) => l.id === "domain")!;
    assert.equal(domain.label, "thelooktag.com");
    assert.equal(domain.href, "https://thelooktag.com/");
    for (const l of links) {
      assert.ok(l.label.trim());
      assert.ok(l.href && l.href !== "#");
      assert.ok(!/tbd/i.test(l.label + l.href));
    }
  });

  it("FOOTER_LINKS_ENABLED overrides on", () => {
    const links = resolveFooterLinks({ env: { ...ENV, FOOTER_LINKS_ENABLED: " Terms , impressum " } });
    assert.deepEqual(visibleFooterLinks(links).map((l) => l.id), ["impressum", "terms"]);
  });

  it("ignores unknown ids and warns with the id only", () => {
    const warned: string[] = [];
    const links = resolveFooterLinks({
      env: { ...ENV, FOOTER_LINKS_ENABLED: "privacy,blog,<script>" },
      warn: (id) => warned.push(id),
    });
    assert.deepEqual(visibleFooterLinks(links).map((l) => l.id), ["privacy"]);
    assert.deepEqual(warned, ["blog", "script"]);
  });

  it("hides links with no href (social URL unset, no APP_URL)", () => {
    const links = visibleFooterLinks(resolveFooterLinks({ adminIds: "instagram,x,domain,about", env: {} }));
    assert.deepEqual(links.map((l) => l.id), ["about"]);
  });

  it("contact email defaults and validates", () => {
    assert.equal(contactEmail({}), "hello@thelooktag.com");
    assert.equal(contactEmail({ CONTACT_EMAIL: "team@example.com" }), "team@example.com");
    assert.equal(contactEmail({ CONTACT_EMAIL: "not an email" }), "hello@thelooktag.com");
  });

  it("parses and toggles ids", () => {
    assert.deepEqual(parseFooterIds("x,x,,privacy", () => {}), ["x", "privacy"]);
    assert.equal(toggleFooterId("", "terms", true), "terms");
    assert.equal(toggleFooterId("terms,privacy", "privacy", false), "terms");
    assert.equal(toggleFooterId("x", "privacy", true), "privacy,x");
  });
});
