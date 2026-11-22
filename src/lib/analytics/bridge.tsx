import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootAnalyticsFromEnv, installAnalyticsReaders } from "@/lib/analytics/browser";
import { identify, setAnalyticsSignedIn } from "@/lib/analytics/runtime";

/** No visual output. Boots PostHog only when consent and the key both exist. */
export function AnalyticsBridge() {
  const { user, isPending } = useCurrentUserState();
  useEffect(() => {
    if (isPending) return;
    installAnalyticsReaders();
    setAnalyticsSignedIn(Boolean(user));
    let alive = true;
    void bootAnalyticsFromEnv().then((loaded) => {
      if (!alive || !loaded || !user?.id) return;
      identify(user.id);
    });
    return () => {
      alive = false;
    };
  }, [isPending, user?.id]);
  return null;
}
