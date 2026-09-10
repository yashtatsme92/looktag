import { useEffect, useLayoutEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { LookFeed } from "@/components/home/look-feed";
import {
  BROWSE_COACH_KEY,
  STYLE_GUIDE_KEY,
  StyleGuide,
} from "@/components/home/style-guide";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useLooksStore } from "@/lib/looks/store";

export const Route = createFileRoute("/")({ component: Home });

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "done";
  } catch {
    return false;
  }
}

function Home() {
  const looks = useLooksStore((s) => s.looks);
  const refreshLooks = useLooksStore((s) => s.refresh);
  const [guideOpen, setGuideOpen] = useState(false);
  const [coachDone, setCoachDone] = useState(true);
  const guideLook = looks.find((look) => look.imageSrc) ?? looks[0];

  useLayoutEffect(() => {
    const guideDone = readFlag(STYLE_GUIDE_KEY);
    setGuideOpen(!guideDone);
    setCoachDone(readFlag(BROWSE_COACH_KEY));
  }, []);

  useEffect(() => {
    void refreshLooks();
  }, [refreshLooks]);

  function handleGuideOpenChange(open: boolean) {
    setGuideOpen(open);
    if (!open) setCoachDone(readFlag(BROWSE_COACH_KEY));
  }

  return (
    <AppShell title="Looks" largeTitle flush>
      {guideLook ? (
        <StyleGuide look={guideLook} open={guideOpen} onOpenChange={handleGuideOpenChange} />
      ) : null}

      {looks.length > 0 ? (
        <LookFeed
          looks={looks}
          showCoach={!coachDone}
          onHowTo={() => setGuideOpen(true)}
        />
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
