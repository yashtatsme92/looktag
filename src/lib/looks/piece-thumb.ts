export type ThumbCrop = { left: number; top: number; width: number; height: number };

/**
 * Place the photo in a square thumb so the pinned point is at the centre.
 * Zoom is relative to the shorter side. The result is clamped so the thumb
 * never shows empty space, and the point stays inside when it is near an edge.
 */
export function pieceThumbCrop(input: {
  imageWidth: number;
  imageHeight: number;
  /** Pin position, 0–100 on the photo. */
  x: number;
  y: number;
  thumb: number;
  zoom?: number;
}): ThumbCrop {
  const thumb = Math.max(1, input.thumb);
  const zoom = input.zoom ?? 2.4;
  const imageWidth = Math.max(1, input.imageWidth);
  const imageHeight = Math.max(1, input.imageHeight);
  const shorter = Math.min(imageWidth, imageHeight);
  let width = imageWidth * ((thumb * zoom) / shorter);
  let height = imageHeight * ((thumb * zoom) / shorter);
  if (width < thumb || height < thumb) {
    const cover = Math.max(thumb / width, thumb / height);
    width *= cover;
    height *= cover;
  }
  const pinX = (Math.min(100, Math.max(0, input.x)) / 100) * width;
  const pinY = (Math.min(100, Math.max(0, input.y)) / 100) * height;
  const left = Math.min(0, Math.max(thumb - width, thumb / 2 - pinX));
  const top = Math.min(0, Math.max(thumb - height, thumb / 2 - pinY));
  return { left, top, width, height };
}