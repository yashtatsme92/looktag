/** Shared 3:4 centre crop. Backfill and the editor must use this one formula. */

/**
 * @param {number} width
 * @param {number} height
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function centeredCrop(width, height) {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  if (width / height > 3 / 4) {
    const w = (height * 3) / 4 / width;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = (width * 4) / 3 / height;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}
