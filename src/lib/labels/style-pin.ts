import type { FashionLabel, FashionStyle } from "./model.ts";

export type StylePin = {
  styleId: string;
  styleName: string;
  houseName: string;
  labelId: string;
  lineSlug: string;
};

/** A pin stays plain when Houses are off, or the Style's House is not live. */
export function resolveStylePin(
  styleId: string | undefined,
  styles: readonly FashionStyle[],
  labels: readonly Pick<FashionLabel, "id" | "name" | "status">[],
  housesOpen: boolean,
): StylePin | null {
  if (!housesOpen || !styleId) return null;
  const style = styles.find((item) => item.id === styleId);
  if (!style) return null;
  const house = labels.find((label) => label.id === style.labelId);
  if (!house || house.status !== "approved") return null;
  return {
    styleId: style.id,
    styleName: style.name,
    houseName: house.name,
    labelId: house.id,
    lineSlug: style.collectionSlug || style.collectionId,
  };
}

/** Type-ahead for Link a Style. Matches the Style name, then the House. */
export function searchStyles(
  query: string,
  styles: readonly FashionStyle[],
  labels: readonly Pick<FashionLabel, "id" | "name" | "status">[],
  housesOpen: boolean,
): StylePin[] {
  const needle = query.trim().toLowerCase();
  const pins = styles
    .map((style) => resolveStylePin(style.id, styles, labels, housesOpen))
    .filter((pin): pin is StylePin => Boolean(pin));
  const ranked = needle
    ? pins.filter(
        (pin) =>
          pin.styleName.toLowerCase().includes(needle) || pin.houseName.toLowerCase().includes(needle),
      )
    : pins;
  return ranked.slice(0, 6);
}
