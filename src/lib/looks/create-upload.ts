export type CreateUploadPresentation = {
  title: string;
  body: string;
  primaryAction: "camera" | "library";
  primaryLabel: string;
  secondaryLabel: string;
};

export function getCreateUploadPresentation({
  phone,
  reading,
}: {
  phone: boolean;
  reading?: boolean;
}): CreateUploadPresentation {
  if (reading) {
    return {
      title: "Reading your photo…",
      body: "Preview is on the way. You’ll place pins once it’s ready.",
      primaryAction: phone ? "camera" : "library",
      primaryLabel: "Reading…",
      secondaryLabel: phone ? "Choose from library" : "Take photo",
    };
  }

  if (phone) {
    return {
      title: "Add a look photo",
      body: "Take or choose a full-body photo, then pin each piece from the preview.",
      primaryAction: "camera",
      primaryLabel: "Take photo",
      secondaryLabel: "Choose from library",
    };
  }

  return {
    title: "Choose a look photo",
    body: "Choose a full-body photo to start, or drag and drop one here, then pin each piece from the preview.",
    primaryAction: "library",
    primaryLabel: "Choose photo",
    secondaryLabel: "Take photo",
  };
}
