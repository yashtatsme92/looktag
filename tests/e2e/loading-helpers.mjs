export async function delayRoutes(page, routes, delayMs) {
  const patterns = Array.isArray(routes) ? routes : [routes];
  const matches = (url) =>
    patterns.some((pattern) => {
      if (pattern instanceof RegExp) {
        pattern.lastIndex = 0;
        return pattern.test(url.href);
      }
      if (typeof pattern === "function") return pattern(url);
      return url.pathname.startsWith(pattern);
    });
  const handler = async (route) => {
    try {
      if (matches(new URL(route.request().url()))) {
        await page.waitForTimeout(delayMs);
      }
      await route.continue();
    } catch {
      /* The page can close while a delayed route is still in flight. */
    }
  };
  await page.route("**/*", handler);
  return () => page.unroute("**/*", handler);
}

export function delayServerFunctions(page, paths, delayMs) {
  return delayRoutes(page, paths, delayMs);
}

export async function installLoadingObserver(page) {
  await page.addInitScript(() => {
    window.__loadingLog = [];
    const tracked = new WeakSet();
    const note = (node, type) => {
      if (!(node instanceof Element)) return;
      const elements = [
        ...(node.matches(".skeleton") ? [node] : []),
        ...node.querySelectorAll(".skeleton"),
      ];
      for (const element of elements) {
        if (type === "enter") {
          if (tracked.has(element)) continue;
          tracked.add(element);
        } else {
          if (!tracked.has(element)) continue;
          tracked.delete(element);
        }
        window.__loadingLog.push({
          type,
          at: performance.now(),
          classes: element.className,
        });
      }
    };
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) note(node, "enter");
        for (const node of record.removedNodes) note(node, "leave");
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

export async function readLoadingLog(page) {
  return page.evaluate(() => window.__loadingLog ?? []);
}
