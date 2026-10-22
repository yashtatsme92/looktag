import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useLayoutEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { captureException } from "@/lib/providers/errors";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("route-pending", "route-skeleton");
    // #176 reports the failure from this screen. A skeleton that was still
    // fading underneath the boundary must not stay on the error screen.
    for (const node of document.querySelectorAll(".skeleton")) node.remove();
  }, []);
  useEffect(() => {
    captureException(error);
  }, [error]);
  return (
    <main
      data-screen="error"
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {error instanceof Error ? error.message : "An unexpected error occurred. Try reloading the page."}
      </p>
    </main>
  );
}
