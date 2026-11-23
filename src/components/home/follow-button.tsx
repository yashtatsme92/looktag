import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { authEnabled } from "@/lib/auth/client";
import { track } from "@/lib/analytics/runtime";
import { useCurrentUserState, useSettledSessionAction } from "@/lib/auth/use-current-user";
import { useAccountLibrary } from "@/lib/account/library";
import { CREATOR_FOLLOWS_KEY, omitSelfFollow, readStoredIds, toggleStoredId, viewerCanFollow, writeStoredIds } from "@/lib/home/follows";

export function FollowButton({
  creatorId,
  name,
  variant = "text-ink",
  onSheetChange,
}: {
  creatorId: string;
  name: string;
  /** text-light: white on a photo. text-ink: ink on paper. profile: filled, then a ghost once following. */
  variant?: "text-light" | "text-ink" | "profile";
  onSheetChange?: (open: boolean) => void;
}) {
  const { user } = useCurrentUserState();
  const runSettled = useSettledSessionAction();
  const [ids, setIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState(false);
  const accountCreators = useAccountLibrary((s) => s.creators);
  useEffect(() => {
    onSheetChange?.(sheet);
  }, [sheet, onSheetChange]);
  const self = !viewerCanFollow(user?.id, creatorId);
  useEffect(() => {
    if (authEnabled && user?.id) return;
    const stored = readStoredIds(CREATOR_FOLLOWS_KEY);
    if (user?.id && user.id === creatorId) {
      const next = omitSelfFollow(stored, user.id);
      if (next.length !== stored.length) writeStoredIds(CREATOR_FOLLOWS_KEY, next);
      return;
    }
    setIds(stored);
  }, [creatorId, user?.id]);
  if (self) return null;
  const on = authEnabled && user ? accountCreators.includes(creatorId) : ids.includes(creatorId);
  const label = on ? "Following ✓" : "Follow";
  const className =
    variant === "profile"
      ? on
        ? "follow-profile follow-profile-ghost"
        : "follow-profile follow-profile-filled"
      : variant === "text-light"
        ? "follow-text follow-text-light"
        : "follow-text follow-text-ink";
  function click() {
    if (!viewerCanFollow(user?.id, creatorId)) return;
    runSettled((sessionUser) => {
      if (!viewerCanFollow(sessionUser?.id, creatorId)) return;
      if (authEnabled && !sessionUser) {
        setSheet(true);
        return;
      }
      if (authEnabled && sessionUser) {
        void useAccountLibrary
          .getState()
          .toggleCreator(creatorId)
          .then((following) => {
            track(following ? "creator_followed" : "creator_unfollowed");
            toast.success(following ? `Following ${name}` : `Unfollowed ${name}`);
          })
          .catch(() => undefined);
        return;
      }
      const next = toggleStoredId(ids, creatorId);
      writeStoredIds(CREATOR_FOLLOWS_KEY, next);
      setIds(next);
      track(next.includes(creatorId) ? "creator_followed" : "creator_unfollowed");
      toast.success(next.includes(creatorId) ? `Following ${name}` : `Unfollowed ${name}`);
    });
  }
  return (
    <>
      <button type="button" className={className} onClick={click}>
        {label}
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
