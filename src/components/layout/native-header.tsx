import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { shouldUseHistoryBack } from "@/lib/nav/back";

type NativeHeaderProps = {
  title: string;
  backTo?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  root?: boolean;
};

export function NativeHeader({ title, backTo, onBack, trailing, root }: NativeHeaderProps) {
  const router = useRouter();

  return (
    <header className="native-header">
      <div className="native-header-side">
        {backTo ? (
          <button
            type="button"
            className="native-back"
            aria-label="Back"
            onClick={() => {
              if (onBack) {
                onBack();
                return;
              }
              if (typeof window !== "undefined" && shouldUseHistoryBack(window.history.state)) {
                router.history.back();
                return;
              }
              void router.navigate({ to: backTo as "/", replace: true });
            }}
          >
            <ChevronLeft className="size-6" strokeWidth={1.8} />
            <span>Back</span>
          </button>
        ) : (
          <span className="native-wordmark">Looktag</span>
        )}
      </div>
      <p className="native-header-title">{root ? "" : title}</p>
      <div className="native-header-side native-header-trailing">{trailing}</div>
    </header>
  );
}
