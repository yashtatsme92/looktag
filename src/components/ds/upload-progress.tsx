/** 3px ink bar. Progress, not a skeleton — it shows immediately. */
export function UploadProgress({ value }: { value: number | null }) {
  if (value == null) return null;
  const now = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="upload-progress"
      role="progressbar"
      aria-label="Uploading photo"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}
    >
      <span style={{ width: `${now}%` }} />
    </div>
  );
}
