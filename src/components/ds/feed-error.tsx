export function FeedLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="echo-end">
      Couldn't load this.{" "}
      <button type="button" className="house-ghost" onClick={onRetry}>
        Try again
      </button>
    </p>
  );
}
