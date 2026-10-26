/** Controls a keyboard user can reach inside an overlay. */
export function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter(
    (el) => el.getAttribute("aria-hidden") !== "true" && el.tabIndex !== -1,
  );
}

/** Cycles Tab inside `root`. Returns true when it handled the key. */
export function trapTab(event: KeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== "Tab") return false;
  const items = focusable(root);
  if (items.length === 0) {
    event.preventDefault();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && root.contains(active);
  if (event.shiftKey && (!inside || active === first || active === root)) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (!inside || active === last || active === root)) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
  return true;
}
