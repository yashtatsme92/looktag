import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { EchoHome } from "@/components/home/echo-home";
import { WideHome } from "@/components/home/wide-home";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useLooksStore } from "@/lib/looks/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const looks = useLooksStore((s) => s.looks);
  const refreshLooks = useLooksStore((s) => s.refresh);

  useEffect(() => {
    void refreshLooks();
  }, [refreshLooks]);

  return (
    <AppShell title="Looks" largeTitle flush header={looks.length > 0 ? "hidden" : "bar"}>
      {looks.length > 0 ? (
        <>
          <div className="lt-phone">
            <EchoHome looks={looks} />
          </div>
          <div className="lt-wide">
            <WideHome looks={looks} />
          </div>
        </>
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