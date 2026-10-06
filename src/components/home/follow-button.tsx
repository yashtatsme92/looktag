import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CREATOR_FOLLOWS_KEY, readStoredIds, toggleStoredId, writeStoredIds } from "@/lib/home/follows";

export function FollowButton({
  creatorId,
  name,
  primary = false,
  tone = "photo",
}: {
  creatorId: string;
  name: string;
  primary?: boolean;
  tone?: "photo" | "paper";
}) {
  const { user, isPending } = useCurrentUserState();
  const [ids, setIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    setIds(readStoredIds(CREATOR_FOLLOWS_KEY));
  }, []);
  const on = ids.includes(creatorId);
  function click() {
    if (authEnabled && !isPending && !user) {
      setSheet(true);
      return;
    }
    const next = toggleStoredId(ids, creatorId);
    writeStoredIds(CREATOR_FOLLOWS_KEY, next);
    setIds(next);
    toast.success(next.includes(creatorId) ? `Following ${name}` : `Unfollowed ${name}`);
  }
  return (
    <>
      <button
        type="button"
        className={primary ? "house-primary house-follow" : tone === "paper" ? "echo-follow echo-follow-ink" : "echo-follow"}
        onClick={click}
      >
        {on ? "Following" : "Follow"}
      </button>
      <AccountSheet
        open={sheet}
        onOpenChange={setSheet}
        intent="follow"
        title="Sign in to follow"
        description="Follow stays on this creator. Cancel returns here."
        primary="Continue with email"
        secondary="Cancel"
      />
    </>
  );
}
