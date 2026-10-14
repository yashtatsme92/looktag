export const PHONE_CREATE_STEPS = [
  { id: "photo", label: "Photo" },
  { id: "crop", label: "Crop" },
  { id: "name", label: "Name" },
  { id: "pins", label: "Pins" },
  { id: "publish", label: "Publish" },
] as const;

export type PhoneCreateStepId =
  | (typeof PHONE_CREATE_STEPS)[number]["id"]
  | "piece"
  | "details";

type LookProgress = {
  imageSrc: string;
  title: string;
  tagCount: number;
  /** True once Crop was saved, skipped, or already stored on the draft. */
  cropDone?: boolean;
};

function cropIsDone(look: LookProgress) {
  return Boolean(look.cropDone || look.title.trim() || look.tagCount > 0);
}

/**
 * Where a phone draft should open.
 * A fresh photo still needs a crop. A named, pinned, or already-cropped
 * draft resumes on the pin plate. Edit opens on the ready screen.
 */
export function initialPhoneStep(
  look: LookProgress,
  mode: "create" | "edit" = "create",
): PhoneCreateStepId {
  if (!look.imageSrc.trim()) return "photo";
  if (mode === "edit") return "publish";
  if (!cropIsDone(look)) return "crop";
  return "pins";
}

export function completedPhoneSteps(look: LookProgress): Array<(typeof PHONE_CREATE_STEPS)[number]["id"]> {
  const done: Array<(typeof PHONE_CREATE_STEPS)[number]["id"]> = [];
  if (look.imageSrc.trim()) done.push("photo");
  if (look.imageSrc.trim() && cropIsDone(look)) done.push("crop");
  if (look.title.trim()) done.push("name");
  if (look.tagCount > 0) done.push("pins");
  return done;
}

/** Null when the step can open. Otherwise a short reason to show the person. */
export function phoneStepBlock(step: PhoneCreateStepId, look: LookProgress): string | null {
  if (step !== "photo" && !look.imageSrc.trim()) return "Add a photo first.";
  if (step === "piece" && look.tagCount === 0) return "Pin a piece on the photo first.";
  return null;
}
