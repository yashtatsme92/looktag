/** Pixel breakpoints, matching the skeleton-grid media queries (1024px / 1280px). */
export function getSkeletonGridColumns(width: number): 2 | 3 | 4 {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  return 2;
}
