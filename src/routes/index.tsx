import { useLayoutEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { EchoHome } from "@/components/home/echo-home";
import { WideHome } from "@/components/home/wide-home";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { listPublicLooks } from "@/lib/looks/api";
import { memoPromise } from "@/lib/loading/memo-promise";
import { useLooksStore } from "@/lib/looks/store";
import { useChromeLayout } from "@/lib/pwa/use-wide-layout";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return { looks: await memoPromise("looks", () => listPublicLooks()) };
    } catch {
      return { looks: [] };
    }
  },
  staleTime: 30_000,
  component: Home,
});

function Home() {
  const loaded = Route.useLoaderData();
  const storeLooks = useLooksStore((s) => s.looks);
  const hydrated = useLooksStore((s) => s.hydrated);
  const chrome = useChromeLayout();
  const looks = hydrated ? storeLooks : loaded.looks.length > 0 ? loaded.looks : storeLooks;

  useLayoutEffect(() => {
    if (loaded.looks.length === 0) return;
    useLooksStore.setState({ looks: loaded.looks, hydrated: true });
  }, [loaded.looks]);

  return (
    <AppShell title="Looks" largeTitle flush header={looks.length > 0 ? "hidden" : "bar"}>
      {looks.length > 0 ? (
        chrome === "phone" ? <EchoHome looks={looks} /> : <WideHome looks={looks} />
      ) : (
        <div className="look-feed-empty flex h-full flex-col items-start justify-end gap-4 px-5 pb-8">
          <p className="look-feed-empty-title font-display text-4xl">No looks yet</p>
          <p className="look-feed-empty-copy max-w-56 text-sm">
            Sign in and publish the first shoppable outfit.
          </p>
          <Button asChild>
            <Link to="/create">
              <Plus className="size-4" />
              New look
            </Link>
          </Button>
        </div>
      )}
    </AppShell>
  );
}