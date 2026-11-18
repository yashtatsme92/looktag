import { COPY } from "@/lib/errors/copy";

export function InlineLoadError({
  message = COPY.loadConnection,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="inline-load-error" role="alert" aria-live="polite">
      <p className="text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        className="house-ghost mt-3"
        onClick={() => {
          if (onRetry) onRetry();
          else window.location.reload();
        }}
      >
        {COPY.tryAgain}
      </button>
    </div>
  );
}
