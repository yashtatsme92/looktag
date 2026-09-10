/**
 * Looktag design system catalog.
 *
 * Visual values live in `src/styles.css` under `@theme` / `:root`.
 * This file is the inventory used by `/admin/look` and the contract for
 * future UI: add a token here when you add one in CSS, then consume
 * the Tailwind / `ds-*` name — never a raw hex in JSX.
 */

export const fonts = [
  {
    token: "font-sans",
    family: "Figtree",
    role: "Body, labels, UI chrome",
    sample: "The shoppable look app.",
  },
  {
    token: "font-display",
    family: "Cormorant Garamond",
    role: "Titles, wordmark, look names",
    sample: "Sunday Coat",
  },
] as const;

export const colors = [
  { token: "background", css: "--color-background", role: "Page ground", hex: "#F4F4F4" },
  { token: "foreground", css: "--color-foreground", role: "Ink / primary text", hex: "#111111" },
  { token: "card", css: "--color-card", role: "Raised surface", hex: "#FFFFFF" },
  { token: "muted", css: "--color-muted", role: "Quiet fill", hex: "#ECECEC" },
  { token: "muted-foreground", css: "--color-muted-foreground", role: "Secondary text", hex: "#6B6B6B" },
  { token: "accent", css: "--color-accent", role: "Hover wash", hex: "#E8E8E8" },
  { token: "border", css: "--color-border", role: "Hairline", hex: "#E0E0E0" },
  { token: "destructive", css: "--color-destructive", role: "Remove / danger", hex: "#7A3A3A" },
  { token: "studio", css: "--color-studio", role: "Device / photo ground", hex: "#111111" },
  { token: "studio-fg", css: "--color-studio-fg", role: "Type on studio", hex: "#F4F4F4" },
] as const;

export const typeRoles = [
  { token: "text-kicker", size: "11px", role: "Eyebrow, section label", className: "ds-kicker" },
  { token: "text-caption", size: "13px", role: "Meta, helper, tab label", className: "font-sans" },
  { token: "text-body", size: "14px", role: "Secondary copy", className: "font-sans" },
  { token: "text-lead", size: "16px", role: "Body, inputs", className: "font-sans" },
  { token: "text-title", size: "20px / wrap", role: "Panel titles", className: "ds-card-title" },
  { token: "text-display", size: "clamp 24–36px", role: "Screen titles", className: "ds-screen-title" },
  { token: "text-section", size: "clamp 20–28px", role: "Section titles", className: "ds-section-title" },
  { token: "text-hero", size: "72px", role: "Desktop wordmark only", className: "font-display italic" },
] as const;

export const radii = [
  { token: "radius-xs", value: "4px", role: "Tiny marks" },
  { token: "radius-sm", value: "8px", role: "Inner controls, chips inner" },
  { token: "radius-md", value: "12px", role: "Buttons, inputs" },
  { token: "radius-lg", value: "16px", role: "Nested panels" },
  { token: "radius-xl", value: "24px", role: "Surfaces, cards" },
] as const;

export const shadows = [
  { token: "shadow-border", role: "Resting surface" },
  { token: "shadow-border-hover", role: "Lifted surface, menus" },
] as const;

export const motion = [
  { token: "--motion-quick", value: "150ms", role: "Hover, press, close" },
  { token: "--motion-fast", value: "250ms", role: "Open, step change" },
  { token: "--motion-slow", value: "400ms", role: "Page / panel reveal" },
  { token: "--ease-out", value: "cubic-bezier(0.23, 1, 0.32, 1)", role: "Default move" },
  { token: "--ease-smooth-out", value: "cubic-bezier(0.22, 1, 0.36, 1)", role: "Enter" },
] as const;

export const space = [
  { token: "--space-1", value: "4px" },
  { token: "--space-2", value: "8px" },
  { token: "--space-3", value: "12px" },
  { token: "--space-4", value: "16px" },
  { token: "--space-5", value: "24px" },
  { token: "--space-6", value: "32px" },
  { token: "--space-7", value: "48px" },
] as const;

export const rules = [
  "Ground, ink, studio — three surfaces. Grey only, no extra hues except destructive.",
  "Figtree for UI, Cormorant for titles. Never a third family.",
  "Outer radius = inner radius + padding. Cards are radius-xl; controls are radius-md.",
  "Elevation is shadow-border, not a 1px solid border on cards.",
  "Tap targets are 44px. Pins use a 44px hit area over an 32px mark.",
  "Phone chrome is the product on small screens: header, tab bar, full-bleed feed. From 768px up, Looktag is a website — masthead, portrait lookbook grid, plate-sized photos. Never stretch a look edge to edge. Never show the phone tab bar on tablet or desktop.",
  "Titles wrap. Never ellipsis a screen, section, card, or native-header title — drop to two lines instead.",
  "No raw hex in JSX. If you need a value, it becomes a token.",
] as const;
