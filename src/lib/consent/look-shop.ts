/** Phone look dock calls the plate's Shop opener without rendering a second sheet. */

let openShop: (() => void) | null = null;

export function bindLookShop(fn: () => void): () => void {
  openShop = fn;
  return () => {
    if (openShop === fn) openShop = null;
  };
}

export function triggerLookShop(): void {
  openShop?.();
}
