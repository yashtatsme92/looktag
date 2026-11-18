import { COPY } from "@/lib/errors/copy";

export function FeedLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="echo-end" role="alert" aria-live="polite">
      {COPY.loadThis}{" "}
      <button type="button" className="house-ghost" onClick={onRetry}>
        {COPY.tryAgain}
      </button>
    </p>
  );
}
