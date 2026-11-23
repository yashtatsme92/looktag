/**
 * A notice counts as seen only when at least half of it has been on a visible
 * page for a full second, and it is not sitting behind a dialog.
 */
export function noticeCountsAsSeen(input: {
  ratio: number;
  elapsedMs: number;
  visibility: "visible" | "hidden" | string;
  blocked: boolean;
}): boolean {
  return (
    input.ratio >= 0.5 &&
    input.elapsedMs >= 1000 &&
    input.visibility === "visible" &&
    !input.blocked
  );
}
