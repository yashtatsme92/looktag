export const PHONE_CREATE_STEPS = [
  { id: "photo", label: "Photo" },
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
};

/**
 * Where a phone draft should open.
 * After a photo, the pin plate is the primary surface — not the name form, and not a piece card.
 * Edit opens on the ready screen so Save changes is the primary.
 */
export function initialPhoneStep(
  look: LookProgress,
  mode: "create" | "edit" = "create",
): PhoneCreateStepId {
  if (!look.imageSrc.trim()) return "photo";
  if (mode === "edit") return "publish";
  return "pins";
}

export function completedPhoneSteps(look: LookProgress): Array<(typeof PHONE_CREATE_STEPS)[number]["id"]> {
  const done: Array<(typeof PHONE_CREATE_STEPS)[number]["id"]> = [];
  if (look.imageSrc.trim()) done.push("photo");
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
