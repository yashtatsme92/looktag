/** The piece editor is a footer on the plate, not a card floating over the look. */
export function pieceEditorIsFooter(
  cardTop: number,
  cardBottom: number,
  plateTop: number,
  plateBottom: number,
): boolean {
  const plateH = plateBottom - plateTop;
  if (!(plateH > 0)) return false;
  const onBottom = Math.abs(cardBottom - plateBottom) <= 8;
  const belowTheFold = cardTop >= plateTop + plateH * 0.45;
  return onBottom && belowTheFold;
}

/** Save / Publish stays in the lower band and is not clipped by the viewport. */
export function saveDockStaysDown(dockTop: number, dockBottom: number, viewportHeight: number): boolean {
  if (!(viewportHeight > 0)) return false;
  return dockBottom <= viewportHeight + 1 && dockTop >= viewportHeight * 0.55;
}
